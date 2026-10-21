import { describe, expect, it } from 'vitest';

import { dayRange } from './day';
import { COMEBACK_BONUS, DAILY_CLEAR_BONUS_XP, GOAL_XP, URGENT_CHANCE, URGENT_REWARD, URGENT_WINDOW_MINUTES } from './rules';
import { computeState, daysToClose, evaluateDay } from './state';
import type { EngineInput, Habit, LogEntry } from './types';
import { urgentQuestFor, urgentWindow } from './urgent';

const days = dayRange('2025-01-01', '2026-12-31');

describe('urgentQuestFor', () => {
  it('is deterministic per day', () => {
    expect(urgentQuestFor('2026-10-21', 'often', 7, 21)).toEqual(urgentQuestFor('2026-10-21', 'often', 7, 21));
  });

  it('never appears when off', () => {
    expect(days.every((d) => urgentQuestFor(d, 'off', 7, 21) === null)).toBe(true);
  });

  it('appears at roughly the advertised rate for each frequency', () => {
    for (const f of ['rare', 'sometimes', 'often'] as const) {
      const rate = days.filter((d) => urgentQuestFor(d, f, 7, 21)).length / days.length;
      expect(Math.abs(rate - URGENT_CHANCE[f])).toBeLessThan(0.05);
    }
  });

  it('stays between an hour after the morning notice and an hour before the warning', () => {
    for (const d of days) {
      const q = urgentQuestFor(d, 'often', 7, 21);
      if (!q) continue;
      expect(q.startMinute).toBeGreaterThanOrEqual(8 * 60);
      expect(q.endMinute).toBeLessThanOrEqual(20 * 60);
      expect(q.endMinute - q.startMinute).toBe(URGENT_WINDOW_MINUTES);
    }
  });

  it('keeps the same challenge and time when the frequency changes', () => {
    const shared = days.filter((d) => urgentQuestFor(d, 'rare', 7, 21));
    for (const d of shared) {
      const rare = urgentQuestFor(d, 'rare', 7, 21)!;
      const often = urgentQuestFor(d, 'often', 7, 21)!;
      expect(often).toEqual(rare);
    }
    expect(shared.length).toBeGreaterThan(0);
  });

  it('returns nothing when the reminder hours leave no room', () => {
    expect(urgentQuestFor('2026-10-21', 'often', 10, 11)).toBeNull();
  });

  it('turns into a local-time window', () => {
    const q = { day: '2026-10-21', challengeId: 'water', text: '', stat: 'STA' as const, startMinute: 9 * 60 + 30, endMinute: 10 * 60 + 15 };
    const { start, end } = urgentWindow(q);
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes()]).toEqual([2026, 9, 21, 9, 30]);
    expect(end.getHours() * 60 + end.getMinutes()).toBe(10 * 60 + 15);
  });
});

describe('Urgent Quest rewards', () => {
  const habit: Habit = {
    id: 'pushups',
    name: 'Push-ups',
    stat: 'STR',
    target: 100,
    unit: 'reps',
    schedule: 'daily',
    grade: 'E',
    startDay: '2026-10-18',
    archived: false,
  };
  const log = (day: string): LogEntry => ({ habitId: 'pushups', day, amount: 100 });
  const run = (logs: LogEntry[], today: string, extra: Partial<EngineInput> = {}) =>
    computeState({
      habits: [habit],
      logs,
      closedDays: daysToClose([habit], new Set(), today).map((d) => evaluateDay([habit], logs, d)),
      today,
      surprises: false,
      ...extra,
    });

  it('adds a flat EXP and gold bonus today and marks it cleared', () => {
    const base = run([], '2026-10-21');
    const s = run([], '2026-10-21', { urgentCleared: [{ day: '2026-10-21', challengeId: 'water' }] });
    expect(s.totalXp - base.totalXp).toBe(URGENT_REWARD.xp);
    expect(s.gold - base.gold).toBe(URGENT_REWARD.gold);
    expect(s.today.urgentCleared).toBe(true);
  });

  it('is recorded on closed days and never changes penalties or streaks', () => {
    const logs = [log('2026-10-18')]; // 19 missed (slip), 20 missed (failure)
    const without = run(logs, '2026-10-21');
    const withUrgent = run(logs, '2026-10-21', { urgentCleared: [{ day: '2026-10-19', challengeId: 'water' }] });
    const d19 = withUrgent.history.find((d) => d.day === '2026-10-19')!;
    expect(d19).toMatchObject({ kind: 'slip', urgent: true });
    expect(withUrgent.streak).toBe(without.streak);
    expect(withUrgent.history.map((d) => d.kind)).toEqual(without.history.map((d) => d.kind));
  });

  it('is not multiplied by the comeback bonus', () => {
    const logs = [log('2026-10-20')]; // 18 slip, 19 failure, 20 comeback
    const s = run(logs, '2026-10-21', { urgentCleared: [{ day: '2026-10-20', challengeId: 'water' }] });
    const day = s.history.find((d) => d.day === '2026-10-20')!;
    const base = GOAL_XP.E + DAILY_CLEAR_BONUS_XP;
    expect(day.xpGained).toBe(base + Math.round(base * COMEBACK_BONUS) + URGENT_REWARD.xp);
  });
});

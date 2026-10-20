import { describe, expect, it } from 'vitest';

import { BASE_STAT, DAILY_CLEAR_BONUS_XP, GOAL_XP } from './rules';
import { computeState, isScheduled } from './state';
import type { Habit, LogEntry } from './types';

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'pushups',
  name: 'Push-ups',
  stat: 'STR',
  target: 100,
  unit: 'reps',
  schedule: 'daily',
  grade: 'E',
  startDay: '2026-10-18',
  archived: false,
  ...over,
});

const log = (habitId: string, day: string, amount: number): LogEntry => ({ habitId, day, amount });

describe('isScheduled', () => {
  it('respects start day, archive flag and weekday schedules', () => {
    expect(isScheduled(habit(), '2026-10-17')).toBe(false);
    expect(isScheduled(habit(), '2026-10-18')).toBe(true);
    expect(isScheduled(habit({ archived: true }), '2026-10-20')).toBe(false);
    // 2026-10-20 is a Tuesday (2).
    expect(isScheduled(habit({ schedule: '1,3,5' }), '2026-10-20')).toBe(false);
    expect(isScheduled(habit({ schedule: '2,4' }), '2026-10-20')).toBe(true);
  });
});

describe('computeState', () => {
  it('starts a new player at level 1, E-rank, base stats', () => {
    const s = computeState({ habits: [], logs: [], today: '2026-10-20' });
    expect(s).toMatchObject({ totalXp: 0, level: 1, rank: 'E', streak: 0 });
    expect(s.stats.STR).toBe(BASE_STAT);
    expect(s.today).toEqual({ goals: [], cleared: 0, total: 0, allCleared: false });
  });

  it('sums partial logs and marks a goal done at the target', () => {
    const s = computeState({
      habits: [habit()],
      logs: [log('pushups', '2026-10-20', 60), log('pushups', '2026-10-20', 40)],
      today: '2026-10-20',
    });
    expect(s.today.goals[0]).toMatchObject({ progress: 100, done: true });
    expect(s.today.allCleared).toBe(true);
  });

  it('awards goal EXP plus the daily clear bonus only when every goal is done', () => {
    const habits = [habit(), habit({ id: 'read', stat: 'INT', target: 20, grade: 'C' })];
    const partial = computeState({ habits, logs: [log('pushups', '2026-10-20', 100)], today: '2026-10-20' });
    expect(partial.totalXp).toBe(GOAL_XP.E);

    const full = computeState({
      habits,
      logs: [log('pushups', '2026-10-20', 100), log('read', '2026-10-20', 20)],
      today: '2026-10-20',
    });
    expect(full.totalXp).toBe(GOAL_XP.E + GOAL_XP.C + DAILY_CLEAR_BONUS_XP);
  });

  it('counts the streak back from yesterday while today is still open', () => {
    const logs = [log('pushups', '2026-10-18', 100), log('pushups', '2026-10-19', 100)];
    expect(computeState({ habits: [habit()], logs, today: '2026-10-20' }).streak).toBe(2);

    const clearedToday = [...logs, log('pushups', '2026-10-20', 100)];
    expect(computeState({ habits: [habit()], logs: clearedToday, today: '2026-10-20' }).streak).toBe(3);
  });

  it('resets the streak after a missed day', () => {
    const logs = [log('pushups', '2026-10-18', 100), log('pushups', '2026-10-20', 100)];
    expect(computeState({ habits: [habit()], logs, today: '2026-10-20' }).streak).toBe(1);
  });

  it('raises a stat by 1 per 5 completions of its habits', () => {
    const days = ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'];
    const s = computeState({
      habits: [habit({ startDay: '2026-10-16', grade: 'F' })],
      logs: days.map((d) => log('pushups', d, 100)),
      today: '2026-10-20',
    });
    expect(s.stats.STR - s.stats.AGI).toBe(1);
  });
});

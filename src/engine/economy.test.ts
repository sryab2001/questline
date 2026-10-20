import { describe, expect, it } from 'vitest';

import { levelFromTotalXp } from './level';
import {
  FAILED_DAY_HP_LOSS,
  FAILED_DAY_PENALTY_XP,
  GOLD_DAILY_CLEAR,
  GOLD_PER_GOAL,
  MAX_MP,
  MP_POTION_AMOUNT,
  POINTS_PER_DAILY_CLEAR,
  SKILLS,
  SURVIVAL_HOURS,
  SURVIVAL_PENALTY_FACTOR,
  SYSTEM_ITEMS,
} from './rules';
import { computeState, daysToClose, evaluateDay } from './state';
import { describeBoxResult, rollBlessedBox, rollCursedBox } from './store';
import { checkSurvival, startSurvival } from './survival';
import type { EngineInput, Habit, LogEntry } from './types';

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'pushups',
  name: 'Push-ups',
  stat: 'STR',
  target: 100,
  unit: 'reps',
  schedule: 'daily',
  grade: 'E',
  startDay: '2026-10-15',
  archived: false,
  ...over,
});
const log = (habitId: string, day: string, amount: number): LogEntry => ({ habitId, day, amount });

function run(habits: Habit[], logs: LogEntry[], today: string, extra: Partial<EngineInput> = {}, survival: Record<string, 'cleared' | 'failed'> = {}) {
  const closedDays = daysToClose(habits, new Set(), today).map((d) => ({ ...evaluateDay(habits, logs, d), survival: survival[d] ?? null }));
  return computeState({ habits, logs, closedDays, today, ...extra });
}

describe('gold and ability points', () => {
  it('earns gold per goal plus a clear bonus, and points only for full clears', () => {
    const habits = [habit({ startDay: '2026-10-19' }), habit({ id: 'read', stat: 'INT', target: 20, startDay: '2026-10-19' })];
    // 19th: both done. Today: one done.
    const logs = [log('pushups', '2026-10-19', 100), log('read', '2026-10-19', 20), log('pushups', '2026-10-20', 100)];
    const s = run(habits, logs, '2026-10-20');
    expect(s.gold).toBe(2 * GOLD_PER_GOAL + GOLD_DAILY_CLEAR + GOLD_PER_GOAL);
    expect(s.abilityPoints).toEqual({ earned: POINTS_PER_DAILY_CLEAR, spent: 0, available: POINTS_PER_DAILY_CLEAR });
  });

  it('subtracts purchases and adds allocated points to stats', () => {
    const habits = [habit({ startDay: '2026-10-20' })];
    const logs = [log('pushups', '2026-10-20', 100)];
    const base = run(habits, logs, '2026-10-20');
    const s = run(habits, logs, '2026-10-20', {
      purchases: [{ day: '2026-10-20', kind: 'treat', cost: 100 }],
      allocations: [{ stat: 'AGI', points: 2 }],
    });
    expect(s.gold).toBe(base.gold - 100);
    expect(s.stats.AGI).toBe(base.stats.AGI + 2);
    expect(s.abilityPoints.available).toBe(POINTS_PER_DAILY_CLEAR - 2);
  });
});

describe('Streak Shield', () => {
  it('absorbs a failed day: no penalty and the streak survives', () => {
    const habits = [habit({ startDay: '2026-10-17' })];
    // 17 clear, 18 fail (shield bought on the 17th), 19 clear
    const logs = [log('pushups', '2026-10-17', 100), log('pushups', '2026-10-19', 100)];
    const purchases = [{ day: '2026-10-17', kind: 'shield' as const, cost: SYSTEM_ITEMS.shield.cost }];
    const s = run(habits, logs, '2026-10-20', { purchases });
    const failedDay = s.history.find((d) => d.day === '2026-10-18')!;
    expect(failedDay).toMatchObject({ failed: true, shielded: true, xpLost: 0, hpChange: 0 });
    expect(s.shields).toBe(0);
    expect(s.streak).toBe(2);
  });

  it('only protects days after it was obtained', () => {
    const habits = [habit({ startDay: '2026-10-18' })];
    const purchases = [{ day: '2026-10-19', kind: 'shield' as const, cost: 0 }];
    const s = run(habits, [log('pushups', '2026-10-19', 100)], '2026-10-20', { purchases });
    expect(s.history[0]).toMatchObject({ day: '2026-10-18', failed: true, shielded: false });
    expect(s.shields).toBe(1);
  });
});

describe('Rest Day and MP', () => {
  it('costs MP, skips the penalty and keeps the streak', () => {
    const habits = [habit({ startDay: '2026-10-18' })];
    const logs = [log('pushups', '2026-10-18', 100)];
    const s = run(habits, logs, '2026-10-20', { skillUses: [{ skill: 'rest_day', day: '2026-10-19' }] });
    expect(s.history[1]).toMatchObject({ day: '2026-10-19', failed: true, rested: true, xpLost: 0, hpChange: 0 });
    expect(s.streak).toBe(1);
    // Full MP, then 1 goal on the 18th (capped), then the skill cost.
    expect(s.mp).toBe(MAX_MP - SKILLS.rest_day.mpCost);
  });

  it('is locked until its level and needs enough MP', () => {
    const habits = [habit({ startDay: '2026-10-20' })];
    const s = run(habits, [], '2026-10-20');
    expect(s.level).toBeLessThan(SKILLS.rest_day.unlockLevel);
    expect(s.skills.rest_day).toEqual({ unlocked: false, activeToday: false, canUse: false });
  });

  it('marks today as rested when used today', () => {
    const s = run([habit({ startDay: '2026-10-20' })], [], '2026-10-20', { skillUses: [{ skill: 'rest_day', day: '2026-10-20' }] });
    expect(s.today.rested).toBe(true);
    expect(s.skills.rest_day.activeToday).toBe(true);
  });

  it('MP potions from a cursed box restore MP, capped', () => {
    const habits = [habit({ startDay: '2026-10-19' })];
    const s = run(habits, [], '2026-10-20', {
      skillUses: [{ skill: 'rest_day', day: '2026-10-19' }],
      purchases: [{ day: '2026-10-20', kind: 'cursed_box', cost: 200, result: { type: 'mp', amount: MP_POTION_AMOUNT } }],
    });
    expect(s.mp).toBe(Math.min(MAX_MP, MAX_MP - SKILLS.rest_day.mpCost + MP_POTION_AMOUNT));
  });
});

describe('Survival penalty quest', () => {
  it('halves the penalty of the day it was taken for', () => {
    // Enough EXP banked first so the level floor doesn't hide the halving.
    const habits = [habit({ startDay: '2026-10-10', grade: 'S' })];
    const logs = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map(
      (d) => log('pushups', d, 100),
    );
    const full = run(habits, logs, '2026-10-20');
    const halved = run(habits, logs, '2026-10-20', {}, { '2026-10-19': 'cleared' });
    const fullLoss = full.history.at(-1)!.xpLost;
    const halfLoss = halved.history.at(-1)!.xpLost;
    expect(levelFromTotalXp(full.totalXp + fullLoss).xpIntoLevel).toBeGreaterThanOrEqual(FAILED_DAY_PENALTY_XP);
    expect(halfLoss).toBe(Math.round(fullLoss / 2));
    expect(halved.history.at(-1)!.hpChange).toBe(-Math.round(FAILED_DAY_HP_LOSS * SURVIVAL_PENALTY_FACTOR));
  });

  it('requires clearing as many goals as were missed, within 4 hours or before reset', () => {
    const now = Date.UTC(2026, 9, 20, 10);
    const reset = Date.UTC(2026, 9, 21, 0);
    const q = startSurvival(2, 1, 5, now, reset)!;
    expect(q).toMatchObject({ status: 'active', required: 3, deadline: now + SURVIVAL_HOURS * 3_600_000 });
    expect(startSurvival(2, 1, 5, now, now + 3_600_000)!.deadline).toBe(now + 3_600_000);
    expect(startSurvival(1, 4, 4, now, reset)).toBeNull();
    expect(startSurvival(5, 3, 4, now, reset)!.required).toBe(4);

    expect(checkSurvival(q, 2, now + 1000)).toBeNull();
    expect(checkSurvival(q, 3, now + 1000)).toBe('cleared');
    expect(checkSurvival(q, 2, q.deadline)).toBe('failed');
  });
});

describe('random boxes', () => {
  it('blessed box picks one of your rewards, or nothing without any', () => {
    expect(rollBlessedBox(['Gaming hour', 'Takeout'], () => 0.99)).toEqual({ type: 'treat', name: 'Takeout' });
    expect(rollBlessedBox([], () => 0.5)).toBeNull();
  });

  it('cursed box rolls shield, MP potion or a gold pouch', () => {
    expect(rollCursedBox(() => 0.1)).toEqual({ type: 'shield' });
    expect(rollCursedBox(() => 0.3)).toEqual({ type: 'mp', amount: MP_POTION_AMOUNT });
    const seq = [0.9, 0.999];
    const gold = rollCursedBox(() => seq.shift()!);
    expect(gold).toEqual({ type: 'gold', amount: 500 });
    expect(describeBoxResult(gold)).toBe('Gold Pouch (+500 G)');
  });
});

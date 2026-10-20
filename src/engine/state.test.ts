import { describe, expect, it } from 'vitest';

import { dayRange } from './day';
import { levelFromTotalXp } from './level';
import {
  BASE_STAT,
  CLEARED_DAY_HP_GAIN,
  COMEBACK_BONUS,
  DAILY_CLEAR_BONUS_XP,
  FAILED_DAY_HP_LOSS,
  FAILED_DAY_PENALTY_XP,
  GOAL_XP,
  MAX_HP,
  SLIP_PENALTY_FACTOR,
} from './rules';
import { computeState, daysToClose, evaluateDay, isScheduled, progressFor } from './state';
import type { Habit, LogEntry } from './types';

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

/** Closes every day before `today` the way the app does, then computes state (no surprises). */
function run(habits: Habit[], logs: LogEntry[], today: string) {
  const closedDays = daysToClose(habits, new Set(), today).map((d) => evaluateDay(habits, logs, d));
  return computeState({ habits, logs, closedDays, today, surprises: false });
}

describe('isScheduled', () => {
  it('respects start day, archive flag and weekday schedules', () => {
    expect(isScheduled(habit(), '2026-10-14')).toBe(false);
    expect(isScheduled(habit(), '2026-10-15')).toBe(true);
    expect(isScheduled(habit({ archived: true }), '2026-10-20')).toBe(false);
    // 2026-10-20 is a Tuesday (2).
    expect(isScheduled(habit({ schedule: '1,3,5' }), '2026-10-20')).toBe(false);
    expect(isScheduled(habit({ schedule: '2,4' }), '2026-10-20')).toBe(true);
  });
});

describe('progressFor', () => {
  it('sums logs including undos, never below zero', () => {
    const logs = [log('pushups', '2026-10-20', 60), log('pushups', '2026-10-20', 40), log('pushups', '2026-10-20', -30)];
    expect(progressFor(logs, 'pushups', '2026-10-20')).toBe(70);
    expect(progressFor([log('pushups', '2026-10-20', -5)], 'pushups', '2026-10-20')).toBe(0);
  });
});

describe('daysToClose', () => {
  it('lists unclosed days from the first habit start up to yesterday', () => {
    const closed = new Set(['2026-10-16']);
    expect(daysToClose([habit({ startDay: '2026-10-15' })], closed, '2026-10-18')).toEqual(['2026-10-15', '2026-10-17']);
  });

  it('is empty with no habits or a habit that started today', () => {
    expect(daysToClose([], new Set(), '2026-10-20')).toEqual([]);
    expect(daysToClose([habit({ startDay: '2026-10-20' })], new Set(), '2026-10-20')).toEqual([]);
  });
});

describe('computeState', () => {
  it('starts a new player at level 1, E-rank, full HP, base stats', () => {
    const s = computeState({ habits: [], logs: [], closedDays: [], today: '2026-10-20' });
    expect(s).toMatchObject({ totalXp: 0, level: 1, rank: 'E', streak: 0, hp: MAX_HP, history: [], streakAtRisk: false });
    expect(s.stats.STR).toBe(BASE_STAT);
    expect(s.today).toMatchObject({ goals: [], cleared: 0, total: 0, allCleared: false, kept: false, rested: false, comeback: false });
  });

  it("counts today's EXP provisionally, with the clear bonus once every goal is done", () => {
    const habits = [habit({ startDay: '2026-10-20' }), habit({ id: 'read', stat: 'INT', target: 20, grade: 'C', startDay: '2026-10-20' })];
    expect(run(habits, [log('pushups', '2026-10-20', 100)], '2026-10-20').totalXp).toBe(GOAL_XP.E);
    const full = run(habits, [log('pushups', '2026-10-20', 100), log('read', '2026-10-20', 20)], '2026-10-20');
    expect(full.totalXp).toBe(GOAL_XP.E + GOAL_XP.C + DAILY_CLEAR_BONUS_XP);
    expect(full.today.allCleared).toBe(true);
  });

  it('a first miss is a Slip: half penalty, never drops a level', () => {
    const habits = [habit({ startDay: '2026-10-18' })];
    const s = run(habits, [log('pushups', '2026-10-18', 100)], '2026-10-20');
    const earned = GOAL_XP.E + DAILY_CLEAR_BONUS_XP;
    expect(s.history.map((d) => d.kind)).toEqual(['cleared', 'slip']);
    const expectedLoss = Math.min(Math.round(FAILED_DAY_PENALTY_XP * SLIP_PENALTY_FACTOR), levelFromTotalXp(earned).xpIntoLevel);
    expect(s.history[1].xpLost).toBe(expectedLoss);
    expect(s.history[1].missed).toEqual(['Push-ups']);
    expect(s.level).toBe(levelFromTotalXp(earned).level);
  });

  it('a second miss in a row is a Failure with the full penalty', () => {
    const habits = [habit({ startDay: '2026-10-17' })];
    const s = run(habits, [log('pushups', '2026-10-17', 100)], '2026-10-20');
    expect(s.history.map((d) => d.kind)).toEqual(['cleared', 'slip', 'failure']);
    expect(s.history[2].hpChange).toBe(-FAILED_DAY_HP_LOSS);
  });

  it('HP: slip costs half, failure full, kept days restore', () => {
    const habits = [habit({ startDay: '2026-10-16' })];
    // 16 slip, 17 failure, 18 cleared (comeback), 19 cleared
    const logs = [log('pushups', '2026-10-18', 100), log('pushups', '2026-10-19', 100)];
    const s = run(habits, logs, '2026-10-20');
    expect(s.hp).toBe(MAX_HP - Math.round(FAILED_DAY_HP_LOSS * SLIP_PENALTY_FACTOR) - FAILED_DAY_HP_LOSS + 2 * CLEARED_DAY_HP_GAIN);
  });

  it('pays a comeback bonus for the day after a miss', () => {
    const habits = [habit({ startDay: '2026-10-18' })];
    const s = run(habits, [log('pushups', '2026-10-19', 100)], '2026-10-20');
    expect(s.history[1]).toMatchObject({ kind: 'cleared', comeback: true });
    const base = GOAL_XP.E + DAILY_CLEAR_BONUS_XP;
    expect(s.history[1].xpGained).toBe(base + Math.round(base * COMEBACK_BONUS));
  });

  it('streak: slips bend it, failures break it, empty days are neutral', () => {
    const daily = [habit({ startDay: '2026-10-17' })];
    // 17 clear, 18 slip, 19 clear → streak 2, today open
    const bent = run(daily, [log('pushups', '2026-10-17', 100), log('pushups', '2026-10-19', 100)], '2026-10-20');
    expect(bent.streak).toBe(2);
    // 17 clear, 18 slip, 19 failure → broken
    expect(run(daily, [log('pushups', '2026-10-17', 100)], '2026-10-20').streak).toBe(0);

    // Mon/Wed/Fri habit: 2026-10-19 Mon cleared, Tue nothing scheduled, today Wed open.
    const mwf = [habit({ schedule: '1,3,5', startDay: '2026-10-19' })];
    expect(run(mwf, [log('pushups', '2026-10-19', 100)], '2026-10-21').streak).toBe(1);
  });

  it('flags the streak at risk the day after a Slip', () => {
    const habits = [habit({ startDay: '2026-10-18' })];
    const s = run(habits, [log('pushups', '2026-10-18', 100)], '2026-10-20');
    expect(s.streakAtRisk).toBe(true);
    expect(run(habits, [log('pushups', '2026-10-18', 100), log('pushups', '2026-10-20', 100)], '2026-10-20').streakAtRisk).toBe(false);
  });

  it('freezes closed days: editing a habit later does not rewrite history', () => {
    const habits = [habit({ startDay: '2026-10-19' })];
    const logs = [log('pushups', '2026-10-19', 100)];
    const closedDays = [evaluateDay(habits, logs, '2026-10-19')];
    const harder = [habit({ startDay: '2026-10-19', target: 500 })];
    const s = computeState({ habits: harder, logs, closedDays, today: '2026-10-20', surprises: false });
    expect(s.history[0].kind).toBe('cleared');
  });

  it('raises a stat by 1 per 5 completions of its habits', () => {
    const days = dayRange('2026-10-16', '2026-10-20');
    const s = run([habit({ startDay: '2026-10-16', grade: 'F' })], days.map((d) => log('pushups', d, 100)), '2026-10-20');
    expect(s.stats.STR - s.stats.AGI).toBe(1);
  });
});

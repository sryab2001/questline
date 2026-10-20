import { describe, expect, it } from 'vitest';

import { addDays, dayRange } from './day';
import { clearDrop, goalDrop, isCritical } from './drops';
import { seededRng } from './random';
import {
  GATE_DAYS_REQUIRED,
  GATE_REWARD,
  GOAL_XP,
  MASTERED_XP_FACTOR,
  MIN_CLEAR_REWARD,
  PASSIVE_STAT_BONUS,
  WEAKENED_BELOW,
} from './rules';
import { computeState, daysToClose, evaluateDay, niceTarget, weekStart } from './state';
import type { Checkin, EngineInput, Habit, LogEntry, OfferDecision } from './types';

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'pushups',
  name: 'Push-ups',
  stat: 'STR',
  target: 100,
  unit: 'reps',
  schedule: 'daily',
  grade: 'E',
  startDay: '2026-08-01',
  archived: false,
  ...over,
});
const log = (habitId: string, day: string, amount: number): LogEntry => ({ habitId, day, amount });
const every = (from: string, to: string, amount = 100, id = 'pushups') => dayRange(from, to).map((d) => log(id, d, amount));

function run(habits: Habit[], logs: LogEntry[], today: string, extra: Partial<EngineInput> = {}) {
  const closedDays = daysToClose(habits, new Set(), today).map((d) => evaluateDay(habits, logs, d));
  return computeState({ habits, logs, closedDays, today, surprises: false, ...extra });
}

describe('Minimum Clear', () => {
  it('keeps the day and streak with reduced rewards', () => {
    const habits = [habit({ startDay: '2026-10-18', minTarget: 10 })];
    // 18 full, 19 minimum only, today open
    const s = run(habits, [log('pushups', '2026-10-18', 100), log('pushups', '2026-10-19', 15)], '2026-10-20');
    expect(s.history.map((d) => d.kind)).toEqual(['cleared', 'min']);
    expect(s.history[1].xpGained).toBe(Math.round(GOAL_XP.E * MIN_CLEAR_REWARD));
    expect(s.history[1].xpLost).toBe(0);
    expect(s.streak).toBe(2);
  });

  it('marks today as kept at the minimum, without the clear bonus', () => {
    const habits = [habit({ startDay: '2026-10-20', minTarget: 10 })];
    const s = run(habits, [log('pushups', '2026-10-20', 12)], '2026-10-20');
    expect(s.today).toMatchObject({ kept: true, allCleared: false });
    expect(s.today.goals[0]).toMatchObject({ min: true, done: false });
  });
});

describe('habit strength', () => {
  it('grows toward 100 with repetition: about 95% after ~66 completions', () => {
    const habits = [habit({ startDay: '2026-08-01' })];
    const s = run(habits, every('2026-08-01', addDays('2026-08-01', 65)), addDays('2026-08-01', 66));
    expect(s.habits.pushups.strength).toBeGreaterThan(94);
    expect(s.habits.pushups.strength).toBeLessThan(96.5);
    expect(s.habits.pushups.completions).toBe(66);
  });

  it('dips a little for one miss and more for consecutive misses', () => {
    const habits = [habit({ startDay: '2026-09-01' })];
    const base = every('2026-09-01', '2026-09-20');
    const one = run(habits, base, '2026-09-22').habits.pushups.strength; // 21st missed
    const clean = run(habits, every('2026-09-01', '2026-09-21'), '2026-09-22').habits.pushups.strength;
    const three = run(habits, base, '2026-09-24').habits.pushups.strength; // 21–23 missed
    expect(one).toBeLessThan(clean);
    expect(clean - one).toBeLessThan(6);
    expect(one - three).toBeGreaterThan(clean - one);
  });

  it('records per-day strength changes in history', () => {
    const habits = [habit({ startDay: '2026-10-19' })];
    const s = run(habits, [log('pushups', '2026-10-19', 100)], '2026-10-20');
    expect(s.history[0].strength[0]).toMatchObject({ habitId: 'pushups', before: 0 });
    expect(s.history[0].strength[0].after).toBeGreaterThan(0);
  });
});

describe('check-ins and mastery', () => {
  const strong = { habits: [habit({ startDay: '2026-08-01' })], logs: every('2026-08-01', '2026-10-19') };

  it('asks for a check-in once strength passes 60%, then weekly', () => {
    const s = run(strong.habits, strong.logs, '2026-10-20');
    expect(s.habits.pushups.checkinDue).toBe(true);
    const recent: Checkin[] = [{ habitId: 'pushups', day: '2026-10-17', avg: 4 }];
    expect(run(strong.habits, strong.logs, '2026-10-20', { checkins: recent }).habits.pushups.checkinDue).toBe(false);
    const old: Checkin[] = [{ habitId: 'pushups', day: '2026-10-10', avg: 4 }];
    expect(run(strong.habits, strong.logs, '2026-10-20', { checkins: old }).habits.pushups.checkinDue).toBe(true);
  });

  it('offers mastery at high strength and a high automaticity score, respecting declines', () => {
    const checkins: Checkin[] = [{ habitId: 'pushups', day: '2026-10-19', avg: 6 }];
    expect(run(strong.habits, strong.logs, '2026-10-20', { checkins }).habits.pushups.masteryReady).toBe(true);
    const low: Checkin[] = [{ habitId: 'pushups', day: '2026-10-19', avg: 4.5 }];
    expect(run(strong.habits, strong.logs, '2026-10-20', { checkins: low }).habits.pushups.masteryReady).toBe(false);
    const declined: OfferDecision[] = [{ habitId: 'pushups', kind: 'mastery', day: '2026-10-15' }];
    expect(run(strong.habits, strong.logs, '2026-10-20', { checkins, decisions: declined }).habits.pushups.masteryReady).toBe(false);
  });

  it('a Passive Skill halves EXP and grants a permanent stat bonus', () => {
    const mastered = [habit({ startDay: '2026-08-01', mastered: true })];
    const normal = run(strong.habits, [...strong.logs, log('pushups', '2026-10-20', 100)], '2026-10-20');
    const passive = run(mastered, [...strong.logs, log('pushups', '2026-10-20', 100)], '2026-10-20');
    expect(passive.passiveBonus.STR).toBe(PASSIVE_STAT_BONUS);
    expect(passive.habits.pushups).toMatchObject({ mastered: true, weakened: false, checkinDue: false });
    // Same history; the passive version earned less EXP per clear.
    expect(passive.totalXp).toBeLessThan(normal.totalXp);
    const todayXp = Math.round(GOAL_XP.E * MASTERED_XP_FACTOR);
    expect(todayXp).toBeLessThan(GOAL_XP.E);
  });

  it('a neglected Passive Skill weakens and loses its bonus', () => {
    const mastered = [habit({ startDay: '2026-09-25', mastered: true })];
    const s = run(mastered, every('2026-09-25', '2026-09-30'), '2026-10-20');
    expect(s.habits.pushups.strength).toBeLessThan(WEAKENED_BELOW);
    expect(s.habits.pushups.weakened).toBe(true);
    expect(s.passiveBonus.STR).toBe(0);
  });
});

describe('surprise drops', () => {
  it('are deterministic per quest and day', () => {
    expect(goalDrop('pushups', '2026-10-20')).toEqual(goalDrop('pushups', '2026-10-20'));
    expect(isCritical('pushups', '2026-10-20')).toBe(isCritical('pushups', '2026-10-20'));
    expect(clearDrop('2026-10-20')).toEqual(clearDrop('2026-10-20'));
  });

  it('roughly match their advertised rates over many days', () => {
    const days = dayRange('2024-01-01', '2026-12-31');
    const rate = days.filter((d) => goalDrop('pushups', d)).length / days.length;
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.16);
    expect(seededRng('a')()).not.toBe(seededRng('b')());
  });

  it('can be switched off', () => {
    const habits = [habit({ startDay: '2026-01-01' })];
    const logs = every('2026-01-01', '2026-10-19');
    const on = computeState({ habits, logs, closedDays: daysToClose(habits, new Set(), '2026-10-20').map((d) => evaluateDay(habits, logs, d)), today: '2026-10-20' });
    const off = run(habits, logs, '2026-10-20');
    expect(on.history.some((d) => d.drops.length > 0)).toBe(true);
    expect(off.history.every((d) => d.drops.length === 0 && d.criticals.length === 0)).toBe(true);
    expect(on.totalXp).toBeGreaterThan(off.totalXp);
  });
});

describe('weekly Gate', () => {
  it('counts kept days Mon–Sun and pays out at the requirement', () => {
    // Week of Mon 2026-10-12 .. Sun 10-18: keep Mon–Fri.
    const habits = [habit({ startDay: '2026-10-12' })];
    const s = run(habits, every('2026-10-12', '2026-10-16'), '2026-10-17');
    expect(weekStart('2026-10-17')).toBe('2026-10-12');
    expect(s.gate).toMatchObject({ weekStart: '2026-10-12', kept: GATE_DAYS_REQUIRED, complete: true });
    expect(s.gate.days).toEqual(['kept', 'kept', 'kept', 'kept', 'kept', 'open', 'open']);
    const noGate = run(habits, every('2026-10-12', '2026-10-15'), '2026-10-17');
    expect(s.totalXp - noGate.totalXp).toBeGreaterThanOrEqual(GATE_REWARD.xp);
  });
});

describe('quest offers', () => {
  it('offers an upgrade after 14 clean days, with a cooldown after deciding', () => {
    const habits = [habit({ startDay: '2026-10-01' })];
    const s = run(habits, every('2026-10-01', '2026-10-19'), '2026-10-20');
    expect(s.offers).toEqual([expect.objectContaining({ kind: 'up', fromTarget: 100, toTarget: 120 })]);
    const decided: OfferDecision[] = [{ habitId: 'pushups', kind: 'up', day: '2026-10-18' }];
    expect(run(habits, every('2026-10-01', '2026-10-19'), '2026-10-20', { decisions: decided }).offers).toEqual([]);
  });

  it('offers a downgrade with a suggested minimum after 3 misses in 7 days', () => {
    const habits = [habit({ startDay: '2026-10-13' })];
    const logs = [log('pushups', '2026-10-13', 100), log('pushups', '2026-10-15', 100), log('pushups', '2026-10-17', 100), log('pushups', '2026-10-19', 100)];
    const s = run(habits, logs, '2026-10-20');
    expect(s.offers[0]).toMatchObject({ kind: 'down', fromTarget: 100, toTarget: 70, suggestMin: 20 });
  });

  it('rounds targets to sensible numbers', () => {
    expect(niceTarget(120)).toBe(120);
    expect(niceTarget(36)).toBe(35);
    expect(niceTarget(6)).toBe(6);
    expect(niceTarget(2.4)).toBe(2.5);
  });
});

describe('Seasons', () => {
  it('awards a title for a strong finished month only', () => {
    const habits = [habit({ startDay: '2026-09-01' })];
    const s = run(habits, every('2026-09-01', '2026-09-30'), '2026-10-05');
    expect(s.seasonTitles).toEqual([{ month: '2026-09', title: 'Monarch of the Season', keptDays: 30 }]);
    const current = run(habits, every('2026-09-01', '2026-10-04'), '2026-10-05');
    expect(current.seasonTitles.map((t) => t.month)).toEqual(['2026-09']);
  });
});

import { describe, expect, it } from 'vitest';

import { JOB_CHANGE_LEVEL, JOB_TRIAL_DAYS } from './achievements';
import { dayRange } from './day';
import { classQuestRarity, gateItem, makeItem } from './items';
import { BASE_STAT, CLASS_COMPLETE_XP, CLASS_STEP_XP_MULT, GATE_REWARD, GOAL_XP } from './rules';
import { computeState, daysToClose, evaluateDay } from './state';
import type { EngineInput, Habit, LogEntry } from './types';

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'pushups',
  name: 'Push-ups',
  stat: 'STR',
  target: 100,
  unit: 'reps',
  schedule: 'daily',
  grade: 'E',
  startDay: '2026-10-01',
  archived: false,
  ...over,
});
const every = (from: string, to: string, id = 'pushups') => dayRange(from, to).map((d): LogEntry => ({ habitId: id, day: d, amount: 100 }));

function run(habits: Habit[], logs: LogEntry[], today: string, extra: Partial<EngineInput> = {}) {
  const closedDays = daysToClose(habits, new Set(), today).map((d) => evaluateDay(habits, logs, d));
  return computeState({ habits, logs, closedDays, today, surprises: false, ...extra });
}

describe('items', () => {
  it('are generated deterministically from their source', () => {
    expect(makeItem('gate:2026-10-12', 'Epic')).toEqual(makeItem('gate:2026-10-12', 'Epic'));
    expect(gateItem('2026-10-12')).toEqual(gateItem('2026-10-12'));
  });

  it('get stronger with rarity', () => {
    const value = (r: 'Normal' | 'Legendary') => makeItem('x', r, 'weapon').effects[0];
    expect((value('Legendary') as { value: number }).value).toBeGreaterThan((value('Normal') as { value: number }).value);
  });

  it('Class Quest rewards scale with chain length', () => {
    expect(classQuestRarity(2)).toBe('Normal');
    expect(classQuestRarity(3)).toBe('Rare');
    expect(classQuestRarity(5)).toBe('Epic');
    expect(classQuestRarity(9)).toBe('Legendary');
  });
});

describe('achievements', () => {
  it('unlock on the day they are earned, with first-clear stat bonuses and items', () => {
    const s = run([habit()], every('2026-10-01', '2026-10-07'), '2026-10-08');
    const first = s.achievements.find((a) => a.id === 'first_clear')!;
    const streak7 = s.achievements.find((a) => a.id === 'streak_7')!;
    expect(first.unlockedDay).toBe('2026-10-01');
    expect(streak7.unlockedDay).toBe('2026-10-07');
    expect(s.allStatsBonus).toBe(1);
    expect(s.stats.AGI).toBe(BASE_STAT + (s.level - 1) + 1);
    expect(s.inventory.map((i) => i.id)).toContain('ach:streak_7');
  });

  it('report progress toward locked ones', () => {
    const s = run([habit()], every('2026-10-01', '2026-10-03'), '2026-10-04');
    expect(s.achievements.find((a) => a.id === 'streak_30')).toMatchObject({ progress: 3, target: 30, unlockedDay: null });
  });
});

describe('weekly Gate items', () => {
  it('drop on the day the Gate is cleared', () => {
    // Mon 2026-10-05 .. Fri 2026-10-09 kept.
    const s = run([habit({ startDay: '2026-10-05' })], every('2026-10-05', '2026-10-09'), '2026-10-10');
    const item = s.inventory.find((i) => i.id === 'gate:2026-10-05')!;
    expect(item.obtainedDay).toBe('2026-10-09');
    expect(s.history.find((d) => d.day === '2026-10-09')!.gateCleared).toBe(true);
    const noGate = run([habit({ startDay: '2026-10-05' })], every('2026-10-05', '2026-10-08'), '2026-10-10');
    expect(s.totalXp - noGate.totalXp).toBeGreaterThanOrEqual(GATE_REWARD.xp);
  });
});

describe('equipment and titles only count from the day they are equipped', () => {
  const habits = [habit({ startDay: '2026-10-01' })];
  const logs = every('2026-10-01', '2026-10-20');
  const weaponId = 'ach:streak_7'; // owned from 2026-10-07

  it('an item equipped later does not rewrite earlier days', () => {
    const base = run(habits, logs, '2026-10-21');
    const item = base.inventory.find((i) => i.id === weaponId)!;
    const late = run(habits, logs, '2026-10-21', { equips: [{ slot: item.slot, itemId: weaponId, day: '2026-10-15' }] });
    const early = run(habits, logs, '2026-10-21', { equips: [{ slot: item.slot, itemId: weaponId, day: '2026-10-08' }] });
    const changed = (s: typeof base) => s.history.filter((d, i) => d.xpGained !== base.history[i].xpGained || d.goldGained !== base.history[i].goldGained || d.hpChange !== base.history[i].hpChange).map((d) => d.day);
    expect(changed(late).every((d) => d >= '2026-10-15')).toBe(true);
    expect(changed(early).every((d) => d >= '2026-10-08')).toBe(true);
    expect(late.equipped[item.slot]?.id).toBe(weaponId);
  });

  it('an item has no effect before it is owned', () => {
    const base = run(habits, logs, '2026-10-21');
    const item = base.inventory.find((i) => i.id === weaponId)!;
    const tooEarly = run(habits, logs, '2026-10-21', { equips: [{ slot: item.slot, itemId: weaponId, day: '2026-10-01' }] });
    const fromOwned = run(habits, logs, '2026-10-21', { equips: [{ slot: item.slot, itemId: weaponId, day: '2026-10-07' }] });
    expect(tooEarly.history.map((d) => d.xpGained)).toEqual(fromOwned.history.map((d) => d.xpGained));
  });

  it('a title effect needs the achievement unlocked and starts on the change day', () => {
    const s = run(habits, logs, '2026-10-21', { titleChanges: [{ title: 'The Persistent', day: '2026-10-10' }] });
    const base = run(habits, logs, '2026-10-21');
    expect(s.activeTitle).toBe('The Persistent');
    const d9 = (x: typeof s) => x.history.find((d) => d.day === '2026-10-09')!.xpGained;
    const d12 = (x: typeof s) => x.history.find((d) => d.day === '2026-10-12')!.xpGained;
    expect(d9(s)).toBe(d9(base));
    expect(d12(s)).toBeGreaterThan(d12(base));
    const locked = run(habits, logs, '2026-10-21', { titleChanges: [{ title: 'Unbroken', day: '2026-10-10' }] });
    expect(locked.activeTitle).toBeNull();
    expect(locked.totalXp).toBe(base.totalXp);
  });
});

describe('Job Change', () => {
  it('unlocks at its level and offers jobs for the top stats', () => {
    const low = run([habit()], every('2026-10-01', '2026-10-03'), '2026-10-04');
    expect(low.level).toBeLessThan(JOB_CHANGE_LEVEL);
    expect(low.jobChange.unlocked).toBe(false);
    expect(low.jobChange.options).toHaveLength(3);
    expect(low.jobChange.options[0].stat).toBe('STR');
  });

  it('trial counts consecutive kept days after it starts and resets on a miss', () => {
    const habits = [habit({ startDay: '2026-10-01' })];
    // trial starts 10-10; 10-10 and 10-11 kept, 10-12 missed, 10-13..10-15 kept
    const logs = [...every('2026-10-01', '2026-10-11'), ...every('2026-10-13', '2026-10-15')];
    const mid = run(habits, logs, '2026-10-13', { jobTrials: [{ day: '2026-10-10' }] });
    // The miss on 10-12 reset the run; today (10-13) is kept, so it's back to 1.
    expect(mid.jobChange).toMatchObject({ trialProgress: 1, trialCleared: false });
    const done = run(habits, logs, '2026-10-16', { jobTrials: [{ day: '2026-10-10' }] });
    expect(done.jobChange).toMatchObject({ trialProgress: JOB_TRIAL_DAYS, trialCleared: true });
  });

  it('a job adds EXP to its stat from the day it is taken, and unlocks "Reborn"', () => {
    const habits = [habit({ startDay: '2026-10-01' })];
    const logs = every('2026-10-01', '2026-10-20');
    const base = run(habits, logs, '2026-10-21');
    const knight = run(habits, logs, '2026-10-21', { jobChanges: [{ jobId: 'sun_knight', day: '2026-10-15' }] });
    expect(knight.jobChange.job?.name).toBe('Sun Knight');
    const d = (x: typeof base, day: string) => x.history.find((h) => h.day === day)!.xpGained;
    expect(d(knight, '2026-10-14')).toBe(d(base, '2026-10-14'));
    expect(d(knight, '2026-10-16')).toBeGreaterThan(d(base, '2026-10-16'));
    expect(knight.achievements.find((a) => a.id === 'job_change')!.unlockedDay).toBe('2026-10-15');
  });
});

describe('Class Quests', () => {
  it('pay EXP per step on the day it is done, and a bonus, item and achievement on completion', () => {
    const quest = {
      id: 'cq1',
      name: 'Path of the Runner',
      steps: [
        { title: 'First 5K', grade: 'D' as const, doneDay: '2026-10-03' },
        { title: 'First 10K', grade: 'B' as const, doneDay: '2026-10-08' },
        { title: 'Half marathon', grade: 'S' as const, doneDay: '2026-10-12' },
      ],
    };
    const base = run([], [], '2026-10-20');
    const s = run([], [], '2026-10-20', { classQuests: [quest] });
    const stepXp = (GOAL_XP.D + GOAL_XP.B + GOAL_XP.S) * CLASS_STEP_XP_MULT;
    expect(s.totalXp - base.totalXp).toBe(stepXp + CLASS_COMPLETE_XP);
    expect(s.classQuests[0]).toMatchObject({ done: 3, total: 3, complete: true, completedDay: '2026-10-12' });
    expect(s.inventory.find((i) => i.id === 'class:cq1')).toMatchObject({ rarity: 'Rare', obtainedDay: '2026-10-12' });
    expect(s.achievements.find((a) => a.id === 'path_walker')!.unlockedDay).toBe('2026-10-12');
  });

  it('track partial progress', () => {
    const s = run([], [], '2026-10-20', {
      classQuests: [{ id: 'cq2', name: 'Read 12 books', steps: [{ title: '1', grade: 'E', doneDay: '2026-10-02' }, { title: '2', grade: 'E', doneDay: null }] }],
    });
    expect(s.classQuests[0]).toMatchObject({ done: 1, total: 2, complete: false });
  });
});

describe('hidden stats', () => {
  it('grow from behaviour', () => {
    const habits = [habit({ startDay: '2026-10-01', minTarget: 10 })];
    // 10-01 kept, 10-02 missed (slip), 10-03 kept (comeback), 10-04 minimum
    const logs: LogEntry[] = [
      { habitId: 'pushups', day: '2026-10-01', amount: 100 },
      { habitId: 'pushups', day: '2026-10-03', amount: 100 },
      { habitId: 'pushups', day: '2026-10-04', amount: 20 },
    ];
    const s = run(habits, logs, '2026-10-05', { checkins: [{ habitId: 'pushups', day: '2026-10-04', avg: 5 }] });
    expect(s.hiddenStats).toEqual({ indomitable: 2, composure: 1, insight: 1, dignity: 0 });
  });
});

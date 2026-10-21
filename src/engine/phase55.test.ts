import { describe, expect, it } from 'vitest';

import { addDays, dayRange } from './day';
import { goalDrop } from './drops';
import { gateItem, type Item } from './items';
import { currentChapter, type MainQuestData, parseMainQuest, parseOutline, taskOpen, taskXp } from './main-quests';
import { DAY_GOLD, DROP_GOLD_V2, GOAL_XP, GOLD_DAILY_CLEAR, GOLD_PER_GOAL, MAIN_QUEST_COMPLETE_XP, RARITIES, SHADOW_NAMES, SKILLS } from './rules';
import { computeState, daysToClose, evaluateDay } from './state';
import type { EngineInput, Habit, LogEntry } from './types';

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'pushups',
  name: 'Push-ups',
  stat: 'STR',
  target: 100,
  unit: 'reps',
  schedule: 'daily',
  grade: 'C',
  startDay: '2026-10-05',
  archived: false,
  ...over,
});
const every = (from: string, to: string, amount = 100): LogEntry[] => dayRange(from, to).map((d) => ({ habitId: 'pushups', day: d, amount }));

function run(habits: Habit[], logs: LogEntry[], today: string, extra: Partial<EngineInput> = {}) {
  const closedDays = daysToClose(habits, new Set(), today).map((d) => evaluateDay(habits, logs, d));
  return computeState({ habits, logs, closedDays, today, surprises: false, ...extra });
}

/** First Monday from `from` whose Gate item has an effect of `kind`. */
function gateWeekWith(kind: Item['effects'][number]['kind'], from = '2026-01-05') {
  for (let w = 0; w < 2000; w++) {
    const week = addDays(from, w * 7);
    if (gateItem(week).effects.some((e) => e.kind === kind)) return week;
  }
  throw new Error(`no gate item with ${kind}`);
}

describe('economy v2: gold measures days of effort', () => {
  // Grade C (55 EXP) → difficulty factor 1.1 → 110 G per kept day. Mon–Thu, no Gate.
  const habits = [habit()];
  const logs = every('2026-10-05', '2026-10-08');

  it('pays per kept day, not per quest', () => {
    const s = run(habits, logs, '2026-10-09', { economyFrom: '2026-10-05' });
    expect(s.gold).toBe(4 * Math.round(DAY_GOLD * 1.1));
    expect(s.economyV2).toBe(true);
  });

  it('adding quests does not inflate gold', () => {
    const two = [habit(), habit({ id: 'run', name: 'Run' })];
    const twoLogs = [...logs, ...logs.map((l) => ({ ...l, habitId: 'run' }))];
    expect(run(two, twoLogs, '2026-10-09', { economyFrom: '2026-10-05' }).gold).toBe(4 * 110);
  });

  it('keeps the old rates before the cutover day', () => {
    const legacy = GOLD_PER_GOAL + GOLD_DAILY_CLEAR;
    expect(run(habits, logs, '2026-10-09').gold).toBe(4 * legacy);
    expect(run(habits, logs, '2026-10-09', { economyFrom: '2026-10-07' }).gold).toBe(2 * legacy + 2 * 110);
  });

  it('pays a share for Minimum Clears and for the done part of a missed day', () => {
    const minDay = run([habit({ minTarget: 10 })], [{ habitId: 'pushups', day: '2026-10-05', amount: 20 }], '2026-10-06', { economyFrom: '2026-10-05' });
    expect(minDay.gold).toBe(Math.round(110 * 0.4));
    const two = [habit(), habit({ id: 'run', name: 'Run' })];
    const half = run(two, [{ habitId: 'pushups', day: '2026-10-05', amount: 100 }], '2026-10-06', { economyFrom: '2026-10-05' });
    expect(half.gold).toBe(Math.round(110 * 0.5 * 0.5));
  });

  it('turns gold drops small and gives gear with Unique and Legendary drops', () => {
    let day = '';
    for (const d of dayRange('2026-01-01', '2027-12-31')) {
      const drop = goalDrop('pushups', d);
      if (drop && RARITIES.indexOf(drop.rarity) >= RARITIES.indexOf('Unique')) {
        day = d;
        break;
      }
    }
    expect(day).not.toBe('');
    const s = run([habit({ startDay: day })], [{ habitId: 'pushups', day, amount: 100 }], addDays(day, 1), { economyFrom: day, surprises: true });
    const drop = s.history[0].drops.find((d) => d.source === 'pushups')!;
    expect(drop.itemId).toBe(`drop:pushups:${day}`);
    expect(s.inventory.map((i) => i.id)).toContain(`drop:pushups:${day}`);
    if (drop.type === 'gold') expect(drop.amount).toBe(DROP_GOLD_V2[drop.rarity]);
  });
});

describe('gear that changes the rules', () => {
  it('a forgiven slip has no penalty and the next miss is a slip, not a Failure', () => {
    const week = gateWeekWith('grace_slip');
    const item = gateItem(week);
    const habits = [habit({ startDay: week })];
    // Mon–Fri kept (Gate cleared Fri), Sat and Sun missed, Mon kept.
    const logs = [...every(week, addDays(week, 4)), ...every(addDays(week, 7), addDays(week, 7))];
    const today = addDays(week, 8);
    const plain = run(habits, logs, today);
    const geared = run(habits, logs, today, { equips: [{ slot: item.slot, itemId: item.id, day: addDays(week, 4) }] });
    const kinds = (s: typeof plain) => s.history.slice(5, 7).map((d) => d.kind);
    expect(kinds(plain)).toEqual(['slip', 'failure']);
    expect(kinds(geared)).toEqual(['slip', 'slip']);
    expect(geared.history[5]).toMatchObject({ graced: true, xpLost: 0, hpChange: 0 });
    expect(geared.history[6].graced).toBe(false);
  });

  it('a Rest Day discount lowers today’s MP cost', () => {
    const week = gateWeekWith('rest_discount');
    const item = gateItem(week);
    const discount = item.effects.find((e) => e.kind === 'rest_discount')!.value;
    const s = run([habit({ startDay: week })], every(week, addDays(week, 4)), addDays(week, 5), {
      equips: [{ slot: item.slot, itemId: item.id, day: addDays(week, 5) }],
    });
    expect(s.restCost).toBe(SKILLS.rest_day.mpCost - discount);
  });
});

describe('the Forge', () => {
  it('turns three same-rarity items into one of the next rarity, and they are used up', () => {
    const habits = [habit({ startDay: '2026-01-05' })];
    const logs = every('2026-01-05', '2026-04-30');
    const base = run(habits, logs, '2026-05-01');
    const byRarity = new Map<string, Item[]>();
    for (const i of base.inventory) byRarity.set(i.rarity, [...(byRarity.get(i.rarity) ?? []), i]);
    const [rarity, items] = [...byRarity.entries()].find(([r, list]) => r !== 'Legendary' && list.length >= 3)!;
    const inputs = items.slice(0, 3).map((i) => i.id);
    const s = run(habits, logs, '2026-05-01', { forges: [{ day: '2026-04-30', inputs }] });
    const ids = s.inventory.map((i) => i.id);
    for (const id of inputs) expect(ids).not.toContain(id);
    const forged = s.inventory.find((i) => i.id.startsWith('forge:'))!;
    expect(RARITIES.indexOf(forged.rarity)).toBe(RARITIES.indexOf(rarity as Item['rarity']) + 1);
    expect(s.forgedCount).toBe(1);
    expect(s.achievements.find((a) => a.id === 'blacksmith')!.unlockedDay).toBe('2026-04-30');
  });

  it('ignores a forge with mixed rarities or items not held', () => {
    const habits = [habit({ startDay: '2026-01-05' })];
    const logs = every('2026-01-05', '2026-03-01');
    const base = run(habits, logs, '2026-03-02');
    const s = run(habits, logs, '2026-03-02', { forges: [{ day: '2026-03-01', inputs: ['nope:1', 'nope:2', 'nope:3'] }] });
    expect(s.inventory.length).toBe(base.inventory.length);
    expect(s.forgedCount).toBe(0);
  });
});

describe('Main Quests', () => {
  const data: MainQuestData = {
    v: 2,
    stat: 'INT',
    habitId: null,
    bounty: '',
    title: 'Machine Mind Scholar',
    chapters: [
      {
        title: 'Foundations',
        tasks: [
          { title: 'How LLMs work', type: 'learn', grade: 'D', doneDay: '2026-10-02' },
          { title: 'Call an API', type: 'practice', grade: 'C', doneDay: '2026-10-03' },
          { title: 'MCP server', type: 'build', grade: 'B', boss: true, doneDay: '2026-10-04' },
        ],
      },
      {
        title: 'RAG',
        tasks: [
          { title: 'Chunking', type: 'learn', grade: 'E', doneDay: '2026-10-06' },
          { title: 'RAG demo', type: 'build', grade: 'B', boss: true, doneDay: '2026-10-08' },
        ],
      },
    ],
  };

  it('pay by type on the day each quest is done, items per chapter, and a big finish', () => {
    const base = run([], [], '2026-10-20');
    const s = run([], [], '2026-10-20', { mainQuests: [{ id: 'gen', name: 'Learn GenAI', data }] });
    const taskSum = GOAL_XP.D * 2 + GOAL_XP.C * 3 + GOAL_XP.B * 5 + GOAL_XP.E * 2 + GOAL_XP.B * 5;
    expect(s.totalXp - base.totalXp).toBe(taskSum + MAIN_QUEST_COMPLETE_XP);
    expect(s.gold - base.gold).toBe(20 + 20 + 100 + 20 + 100);
    expect(s.inventory.find((i) => i.id === 'mq:gen:0')).toMatchObject({ rarity: 'Rare', obtainedDay: '2026-10-04' });
    expect(s.inventory.find((i) => i.id === 'mq:gen')).toMatchObject({ rarity: 'Unique', obtainedDay: '2026-10-08' });
    expect(s.stats.INT - s.stats.STR).toBe(2);
    expect(s.mainQuests[0]).toMatchObject({ complete: true, completedDay: '2026-10-08', done: 5, total: 5, title: 'Machine Mind Scholar' });
    expect(s.achievements.find((a) => a.id === 'path_walker')!.unlockedDay).toBe('2026-10-08');
  });

  it('open chapters in order and the Boss last', () => {
    const fresh: MainQuestData = {
      ...data,
      chapters: data.chapters.map((c) => ({ ...c, tasks: c.tasks.map((t) => ({ ...t, doneDay: null })) })),
    };
    expect(currentChapter(fresh)).toBe(0);
    expect(taskOpen(fresh, 0, 0)).toBe(true);
    expect(taskOpen(fresh, 0, 2)).toBe(false); // Boss waits for the others
    expect(taskOpen(fresh, 1, 0)).toBe(false); // next chapter locked
    const s = run([], [], '2026-10-20', { mainQuests: [{ id: 'gen', name: 'Learn GenAI', data: fresh }] });
    expect(s.mainQuests[0].chapters.map((c) => c.unlocked)).toEqual([true, false]);
  });

  it('read Phase 5 Class Quests as one chapter', () => {
    const q = parseMainQuest(JSON.stringify([{ title: 'First 5K', grade: 'D', doneDay: '2026-10-03' }, { title: 'Read', grade: 'B', target: 12, count: 7, doneDay: null }]));
    expect(q.chapters).toHaveLength(1);
    expect(q.chapters[0].tasks[1]).toMatchObject({ title: 'Read', type: 'practice', target: 12, count: 7 });
    expect(taskXp({ grade: 'D', type: 'practice' })).toBe(GOAL_XP.D * 3);
  });

  it('turn a pasted outline into chapters', () => {
    const chapters = parseOutline(`Foundations
  How LLMs work
  Practice: Call an LLM API
  Boss: Build an MCP server over my notes [A]
  Read 3 papers x3
RAG
- Chunking strategies [C]
- Build: Vector DB`);
    expect(chapters.map((c) => c.title)).toEqual(['Foundations', 'RAG']);
    expect(chapters[0].tasks.map((t) => [t.title, t.type, t.grade, !!t.boss, t.target ?? null])).toEqual([
      ['How LLMs work', 'learn', 'D', false, null],
      ['Call an LLM API', 'practice', 'C', false, null],
      ['Read 3 papers', 'learn', 'D', false, 3],
      ['Build an MCP server over my notes', 'build', 'A', true, null],
    ]);
    expect(chapters[1].tasks.map((t) => [t.title, t.type, t.grade])).toEqual([
      ['Chunking strategies', 'learn', 'C'],
      ['Vector DB', 'build', 'B'],
    ]);
  });
});

describe('Shadow Army and Hunter’s Record', () => {
  it('extracts mastered quests as named, ranked Shadows', () => {
    const habits = [habit({ startDay: '2026-08-01', mastered: true })];
    const s = run(habits, every('2026-08-01', '2026-09-29'), '2026-09-30', {
      decisions: [{ habitId: 'pushups', kind: 'mastery', day: '2026-09-20', accepted: true }],
    });
    expect(s.shadows).toHaveLength(1);
    expect(SHADOW_NAMES).toContain(s.shadows[0].name);
    expect(s.shadows[0]).toMatchObject({ habitName: 'Push-ups', rank: 'Commander', faded: false, extractedDay: '2026-09-20' });
  });

  it('totals real-world work and awards milestone titles', () => {
    const s = run([habit()], every('2026-10-05', '2026-10-16'), '2026-10-17');
    const rec = s.record.habits[0];
    expect(rec).toMatchObject({ total: 1200, daysDone: 12, bestDay: 100, last30: 1200, prev30: 0 });
    expect(s.record.milestones).toEqual([{ habitId: 'pushups', times: 10, title: 'Push-ups Initiate', amount: 1000, reachedDay: '2026-10-14' }]);
    expect(s.record.longestStreak).toBe(12);
    expect(s.record.keptLast30).toBe(12);
  });
});

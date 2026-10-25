/// <reference types="node" />
// Runs the real Test World seed against a real SQLite database (node:sqlite via
// drizzle's proxy driver), then derives the player state the way the app does.
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { computeState, parseMainQuest, type PlayerState } from '@/engine';

import * as schema from './schema';

vi.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(randomBytes(n)) }));
// The native screen-time module isn't built in Node; the seed doesn't use it.
vi.mock('../../modules/screen-time', () => ({ default: null }));

vi.mock('./client', () => {
  const sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../../drizzle/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    for (const stmt of readFileSync(new URL(f, dir), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) sqlite.exec(stmt);
    }
  }
  const db = drizzle(
    async (sql, params, method) => {
      const st = sqlite.prepare(sql);
      st.setReturnArrays(true);
      if (method === 'run') {
        st.run(...(params as never[]));
        return { rows: [] };
      }
      const rows = st.all(...(params as never[])) as unknown as unknown[][];
      return { rows: method === 'get' ? (rows[0] ?? []) : rows } as { rows: unknown[] };
    },
    { schema },
  );
  return { db, isTestWorld: () => true };
});

let state: PlayerState;
let today: string;
let habitList: import('@/engine').Habit[] = [];
let logRowsAll: (typeof schema.logs.$inferSelect)[] = [];
let journalAll: (typeof schema.journal.$inferSelect)[] = [];
let mainQuestInputs: { name: string; doneDays: string[]; remaining: number }[] = [];

beforeAll(async () => {
  const { seedTestWorld } = await import('./test-world');
  const { db } = await import('./client');
  const { todayKey, toEngineHabit } = await import('./actions');
  await seedTestWorld();
  today = await todayKey();

  const habits = (await db.select().from(schema.habits)).map(toEngineHabit);
  habitList = habits;
  const logs = await db.select().from(schema.logs);
  logRowsAll = logs;
  journalAll = await db.select().from(schema.journal);
  const results = await db.select().from(schema.dayResults);
  const events = (await db.select().from(schema.events)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const checkins = await db.select().from(schema.checkins);
  const purchases = await db.select().from(schema.purchases);
  const classQuests = await db.select().from(schema.classQuests);
  mainQuestInputs = classQuests.map((q) => {
    const tasks = parseMainQuest(q.stepsJson).chapters.flatMap((c) => c.tasks);
    return { name: q.name, doneDays: tasks.filter((t) => t.doneDay).map((t) => t.doneDay!), remaining: tasks.filter((t) => !t.doneDay).length };
  });
  const data = (e: (typeof events)[number]) => (e.dataJson ? JSON.parse(e.dataJson) : {});

  state = computeState({
    habits,
    logs: logs.map((l) => ({ habitId: l.habitId, day: l.day, amount: l.amount })),
    closedDays: results.map((r) => ({ day: r.day, goals: JSON.parse(r.outcomesJson), survival: null })),
    today,
    purchases: purchases.map((p) => ({ day: p.day, kind: p.kind, cost: p.cost, result: null })),
    skillUses: [],
    allocations: [],
    checkins: checkins.map((c) => ({ habitId: c.habitId, day: c.day, avg: c.avg })),
    decisions: events.filter((e) => e.kind === 'offer').map((e) => ({ habitId: e.ref, ...data(e), day: e.day })),
    equips: events.filter((e) => e.kind === 'equip').map((e) => ({ slot: e.ref as never, itemId: data(e).itemId, day: e.day })),
    titleChanges: events.filter((e) => e.kind === 'title').map((e) => ({ title: e.ref, day: e.day })),
    jobChanges: [],
    jobTrials: events.filter((e) => e.kind === 'job_trial').map((e) => ({ day: e.day })),
    mainQuests: classQuests.map((q) => ({ id: q.id, name: q.name, data: parseMainQuest(q.stepsJson) })),
    forges: [],
    economyFrom: events.find((e) => e.kind === 'economy')?.day ?? null,
    surprises: true,
    urgentCleared: [],
  });
});

describe('Test World seed', () => {
  it.runIf(!!process.env.DUMP_REPORT_INPUT)('dumps a report input for the AI pilot', async () => {
    const { writeFileSync } = await import('node:fs');
    const { analyze, reportInput, addDays, reviewWeek } = await import('@/engine');
    const week = reviewWeek(today);
    const strength = Object.fromEntries(Object.entries(state.habits).map(([id, h]) => [id, h.strength]));
    const base = {
      today,
      history: state.history,
      habits: habitList.map((h) => ({ id: h.id, name: h.name, limit: h.limit, archived: h.archived, unit: h.unit, target: h.target })),
      strength,
      logTimes: logRowsAll.filter((l) => l.amount > 0).map((l) => ({ habitId: l.habitId, day: l.day, hour: l.createdAt.getHours() })),
      journal: journalAll.map((j) => ({ day: j.day, mood: j.mood || null, energy: j.energy || null })),
      mainQuests: mainQuestInputs,
      streak: state.streak,
      longestStreak: state.record.longestStreak,
    };
    const weekly = reportInput(analyze({ ...base, period: 'week', from: week, to: addDays(week, 6) }), { level: state.level });
    const monthly = reportInput(analyze({ ...base, period: 'month', from: addDays(today, -30), to: addDays(today, -1) }), { level: state.level });
    writeFileSync(process.env.DUMP_REPORT_INPUT!, JSON.stringify({ weekly, monthly }, null, 2));
  });


  it('builds a mid-game player', () => {
    if (process.env.SHOW_TEST_WORLD) {
      const { level, rank, gold, streak, hp, maxHp, inventory, achievements, stats, shadows, record } = state;
      console.log({
        level,
        rank,
        gold,
        streak,
        hp: `${hp}/${maxHp}`,
        items: inventory.map((i) => `${i.rarity} ${i.name}`),
        achievements: achievements.filter((a) => a.unlockedDay).map((a) => a.title),
        stats,
        shadows: shadows.map((s) => `${s.name} (${s.rank}) of ${s.habitName}`),
        milestones: record.milestones.map((m) => m.title),
      });
    }
    expect(state.level).toBeGreaterThanOrEqual(12);
    // Days 40–41 are a slip then a failure, unless a Streak Shield absorbs it or gear forgives the slip.
    expect(state.history.filter((d) => d.kind === 'failure' || d.kind === 'shielded').length).toBeLessThanOrEqual(1);
    expect(state.history.filter((d) => d.kind === 'slip').length).toBeGreaterThanOrEqual(3);
    expect(state.streak).toBeGreaterThan(14);
  });

  it('has the Job Change ready to choose', () => {
    expect(state.jobChange.unlocked).toBe(true);
    expect(state.jobChange.trialCleared).toBe(true);
    expect(state.jobChange.job).toBeNull();
    expect(state.jobChange.options).toHaveLength(3);
  });

  it('has achievements, items, an equipped item and an active title', () => {
    const unlocked = state.achievements.filter((a) => a.unlockedDay).map((a) => a.id);
    expect(unlocked).toEqual(expect.arrayContaining(['first_clear', 'streak_7', 'streak_30', 'gate_1', 'gate_10', 'awakened']));
    expect(unlocked).not.toContain('shadow_monarch');
    expect(state.inventory.length).toBeGreaterThanOrEqual(8);
    expect(Object.values(state.equipped).filter(Boolean)).toHaveLength(1);
    expect(state.activeTitle).toBe('The Persistent');
  });

  it('has Main Quests in progress, Shadows and a Record', () => {
    expect(state.mainQuests.map((q) => `${q.done}/${q.total}`)).toEqual(['7/16', '2/3', '0/1']);
    expect(state.mainQuests[0]).toMatchObject({ current: 1, complete: false, title: 'Machine Mind Scholar' });
    expect(state.mainQuests[0].chapters.map((c) => [c.cleared, c.unlocked])).toEqual([
      [true, true],
      [false, true],
      [false, false],
      [false, false],
    ]);
    expect(state.inventory.map((i) => i.id)).toContain(state.mainQuests[0].chapters[0].reward!.id);
    expect(state.shadows.map((s) => s.habitName)).toEqual(['Read']);
    expect(state.record.milestones.length).toBeGreaterThan(0);
  });

  it('has a screen-time Limit Quest with history', () => {
    const phone = state.today.goals.find((g) => g.limit)!;
    expect(phone).toMatchObject({ name: 'Phone under 3 h', progress: 75, done: true });
    expect(state.record.habits.find((h) => h.limit)).toMatchObject({ daysLast30: 30 });
  });

  it('keeps gold at days-of-effort scale', () => {
    // ~80 kept days at ~70 G plus Gates: thousands, not the 33k of the old per-quest economy.
    expect(state.economyV2).toBe(true);
    expect(state.gold).toBeGreaterThan(4000);
    expect(state.gold).toBeLessThan(12000);
  });
});

/// <reference types="node" />
// Runs the real Test World seed against a real SQLite database (node:sqlite via
// drizzle's proxy driver), then derives the player state the way the app does.
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { computeState, type PlayerState } from '@/engine';

import * as schema from './schema';

vi.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(randomBytes(n)) }));

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

beforeAll(async () => {
  const { seedTestWorld } = await import('./test-world');
  const { db } = await import('./client');
  const { todayKey, toEngineHabit } = await import('./actions');
  await seedTestWorld();
  today = await todayKey();

  const habits = (await db.select().from(schema.habits)).map(toEngineHabit);
  const logs = await db.select().from(schema.logs);
  const results = await db.select().from(schema.dayResults);
  const events = (await db.select().from(schema.events)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const checkins = await db.select().from(schema.checkins);
  const purchases = await db.select().from(schema.purchases);
  const classQuests = await db.select().from(schema.classQuests);
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
    classQuests: classQuests.map((q) => ({ id: q.id, name: q.name, steps: JSON.parse(q.stepsJson) })),
    surprises: true,
    urgentCleared: [],
  });
});

describe('Test World seed', () => {
  it('builds a mid-game player', () => {
    if (process.env.SHOW_TEST_WORLD) {
      const { level, rank, gold, streak, hp, maxHp, inventory, achievements, stats } = state;
      console.log({ level, rank, gold, streak, hp: `${hp}/${maxHp}`, items: inventory.map((i) => `${i.rarity} ${i.name}`), achievements: achievements.filter((a) => a.unlockedDay).map((a) => a.title), stats });
    }
    expect(state.level).toBeGreaterThanOrEqual(12);
    // Days 40–41 are a slip then a failure, unless a dropped Streak Shield absorbs it.
    expect(state.history.filter((d) => d.kind === 'failure' || d.kind === 'shielded')).toHaveLength(1);
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
    // Left in progress so it can be watched unlocking.
    expect(unlocked).not.toContain('comeback_5');
    expect(state.inventory.length).toBeGreaterThanOrEqual(8);
    expect(Object.values(state.equipped).filter(Boolean)).toHaveLength(1);
    expect(state.activeTitle).toBe('The Persistent');
  });

  it('has class quests in progress and gold to spend', () => {
    expect(state.classQuests.map((q) => `${q.done}/${q.total}`)).toEqual(['2/3', '0/1', '1/4']);
    expect(state.gold).toBeGreaterThan(2000);
  });
});

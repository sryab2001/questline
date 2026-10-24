/// <reference types="node" />
// Runs the server's weekly-report hook (server/pb_hooks/questline_report.js) against
// fake PocketBase globals, so its summary and request logic are checked before deploy.
import { createRequire } from 'node:module';

import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
const record = (collection: string, data: Row) => ({
  collection,
  id: String(data.id ?? ''),
  getString: (k: string) => String(data[k] ?? ''),
  getFloat: (k: string) => Number(data[k] ?? 0),
  getInt: (k: string) => Math.trunc(Number(data[k] ?? 0)),
  set: (k: string, v: unknown) => (data[k] = v),
  data,
});

let db: Record<string, ReturnType<typeof record>[]>;
let sent: { url: string; body: string; headers: Record<string, string> }[];
let env: Record<string, string>;

class BadRequestError extends Error {}
class TooManyrequestsError extends Error {}

const g = globalThis as Record<string, unknown>;
g.BadRequestError = BadRequestError;
g.TooManyrequestsError = TooManyrequestsError;
g.$os = { getenv: (k: string) => env[k] ?? '' };
g.$http = {
  send: (req: { url: string; body: string; headers: Record<string, string> }) => {
    sent.push(req);
    return { statusCode: 200, json: { choices: [{ message: { content: ' VERDICT: Strong week. ' } }] } };
  },
};
// Only the filters the hook uses: owner match, and day >= for logs.
g.$app = {
  findRecordsByFilter: (c: string, filter: string, sort: string, limit: number, _o: number, params: Row) => {
    let rows = (db[c] ?? []).filter((r) => !params.o || r.data.owner === params.o);
    if (filter.includes("kind = 'review'")) rows = rows.filter((r) => r.data.kind === 'review');
    if (filter.includes('ai_report = true')) rows = rows.filter((r) => r.data.ai_report === true);
    if (params.d) rows = rows.filter((r) => String(r.data.day) >= String(params.d));
    if (params.t) rows = rows.filter((r) => r.data.through === params.t);
    if (sort === '-day') rows = [...rows].sort((a, b) => (String(a.data.day) < String(b.data.day) ? 1 : -1));
    if (sort === '-created') rows = [...rows].sort((a, b) => (String(a.data.created) < String(b.data.created) ? 1 : -1));
    return rows.slice(0, limit);
  },
  findCollectionByNameOrId: (name: string) => ({ name }),
  save: (r: ReturnType<typeof record>) => {
    r.data.created = new Date().toISOString().replace('T', ' ');
    r.data.id = `rep${(db.reports ?? []).length + 1}`;
    (db.reports ??= []).push(r);
  },
};
g.Record = function (this: unknown, collection: { name: string }) {
  return record(collection.name, {});
};

const report = createRequire(import.meta.url)('../server/pb_hooks/questline_report.js');

const day = (i: number) => `2026-10-${String(10 + i).padStart(2, '0')}`;

beforeEach(() => {
  sent = [];
  env = { GROQ_API_KEY: 'test-key' };
  db = {
    day_results: Array.from({ length: 10 }, (_, i) =>
      record('day_results', {
        owner: 'u1',
        day: day(i),
        outcomes_json: JSON.stringify([
          { habitId: 'h1', done: i !== 4, min: false },
          { habitId: 'h2', done: false, min: i % 2 === 0 },
        ]),
      }),
    ),
    habits: [
      record('habits', { id: 'h1', owner: 'u1', name: 'Push-ups', target: 50, unit: 'reps', limit_source: '' }),
      record('habits', { id: 'h2', owner: 'u1', name: 'Phone under 3 h', target: 180, unit: 'min', limit_source: 'screen_time' }),
    ],
    logs: [record('logs', { owner: 'u1', habit_id: 'h1', day: day(9), amount: 50 }), record('logs', { owner: 'u1', habit_id: 'h1', day: day(1), amount: 20 })],
    class_quests: [
      record('class_quests', {
        owner: 'u1',
        name: 'Learn GenAI',
        steps_json: JSON.stringify({ chapters: [{ title: 'Foundations', tasks: [{ title: 'a', doneDay: day(8) }, { title: 'b', doneDay: null }] }] }),
      }),
    ],
    events: [record('events', { owner: 'u1', kind: 'review', data_json: JSON.stringify({ focus: 'Push-ups' }), created: '2026-10-12 10:00:00' })],
    settings: [record('settings', { owner: 'u1', ai_report: true })],
    reports: [],
  };
});

describe('server weekly report hook', () => {
  it('summarises the last two weeks from synced data, without notes', () => {
    const s = report.summarize('u1');
    expect(s.through).toBe(day(9));
    expect(s.thisWeek).toEqual({ daysWithQuests: 7, daysKept: 2 });
    expect(s.previousWeek).toEqual({ daysWithQuests: 3, daysKept: 2 });
    const push = s.quests.find((q: { name: string }) => q.name === 'Push-ups');
    expect(push.thisWeek).toEqual({ fullClears: 6, minimumClears: 0, missed: 1, totalLogged: 50 });
    expect(push.previousWeekTotalLogged).toBe(20);
    expect(s.quests[1].limitQuest).toBe(true);
    expect(s.mainQuests[0]).toMatchObject({ questsDone: 1, questsTotal: 2, clearedThisWeek: 1, currentChapter: 'Foundations' });
    expect(s.lastWeeksFocus).toBe('Push-ups');
  });

  it('writes and stores a report, then rate-limits manual requests', () => {
    const r = report.generateFor('u1');
    expect(r).toMatchObject({ through: day(9), body: 'VERDICT: Strong week.', model: 'llama-3.3-70b-versatile' });
    expect(sent[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(sent[0].headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(sent[0].body).messages[1].content).toContain('Push-ups');
    expect(() => report.generateFor('u1')).toThrow(TooManyrequestsError);
  });

  it('explains when the key is missing or history is too short', () => {
    env = {};
    expect(() => report.generateFor('u1')).toThrow(/GROQ_API_KEY/);
    env = { GROQ_API_KEY: 'k' };
    db.day_results = db.day_results.slice(0, 2);
    expect(() => report.generateFor('u1')).toThrow(/Not enough history/);
  });

  it('writes one Sunday report per opted-in player and week', () => {
    report.generateWeekly();
    report.generateWeekly();
    expect(db.reports).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });
});

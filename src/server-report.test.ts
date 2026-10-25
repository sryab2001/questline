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
// A fake Groq: model list, and chat that only knows the models in `available`.
let available: string[];
let reply: string;
g.$http = {
  send: (req: { url: string; method?: string; body: string; headers: Record<string, string> }) => {
    sent.push(req);
    if (req.url.endsWith('/models')) {
      return { statusCode: 200, json: { data: available.map((id) => ({ id, active: true })) } };
    }
    const model = JSON.parse(req.body).model;
    if (!available.includes(model)) {
      return { statusCode: 404, json: { error: { message: `The model \`${model}\` does not exist or you do not have access to it.` } } };
    }
    return { statusCode: 200, json: { choices: [{ message: { content: reply } }] } };
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
    if (params.r) rows = rows.filter((r) => r.data.ref === params.r && r.data.kind === 'report_input');
    if (params.p) rows = rows.filter((r) => r.data.period === params.p);
    if (sort === '-day') rows = [...rows].sort((a, b) => (String(a.data.day) < String(b.data.day) ? 1 : -1));
    if (sort === '-created') rows = [...rows].sort((a, b) => (String(a.data.created) < String(b.data.created) ? 1 : -1));
    return rows.slice(0, limit);
  },
  findCollectionByNameOrId: (name: string) => ({ name }),
  findRecordById: (c: string, id: string) => {
    const r = (db[c] ?? []).find((x) => x.data.id === id);
    if (!r) throw new Error('not found');
    return { ...r, get: (k: string) => r.data[k] };
  },
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
  available = ['llama-3.3-70b-versatile', 'whisper-large-v3'];
  reply = ' VERDICT: Strong week. ';
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
    settings: [record('settings', { id: 'settings-u1', owner: 'u1', ai_report: true, ai_reads_writing: false })],
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
    expect(JSON.parse(sent[0].body).reasoning_effort).toBeUndefined();
    expect(sent[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(sent[0].headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(sent[0].body).messages[1].content).toContain('Push-ups');
    expect(() => report.generateFor('u1')).toThrow(TooManyrequestsError);
  });

  it('falls back to a chat model the key can use, and strips hidden reasoning', () => {
    // The model list a real key returned (2026-10-24).
    available = ['openai/gpt-oss-safeguard-20b', 'canopylabs/orpheus-v1-english', 'meta-llama/llama-prompt-guard-2-86m', 'whisper-large-v3', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
    reply = '<think>The player kept 2 days...</think>' + String.fromCharCode(10) + 'VERDICT: Hold the line.';
    const r = report.generateFor('u1');
    expect(r.model).toBe('openai/gpt-oss-120b');
    expect(r.body).toBe('VERDICT: Hold the line.');
    expect(sent.map((x) => (x.url.endsWith('/models') ? 'models' : JSON.parse(x.body).model))).toEqual([
      'llama-3.3-70b-versatile',
      'models',
      'openai/gpt-oss-120b',
    ]);
  });

  it('uses GROQ_MODEL when set, keeping reasoning models brief', () => {
    env.GROQ_MODEL = 'openai/gpt-oss-20b';
    available = ['openai/gpt-oss-20b'];
    expect(report.generateFor('u1').model).toBe('openai/gpt-oss-20b');
    expect(JSON.parse(sent[0].body)).toMatchObject({ reasoning_effort: 'low', max_tokens: 2000 });
  });

  it('refuses to store an empty report', () => {
    reply = '<think>only thinking, no answer</think>';
    expect(() => report.generateFor('u1')).toThrow(/empty report/);
    expect(db.reports).toHaveLength(0);
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

  const appInput = (period: 'week' | 'month') => ({
    period,
    from: '2026-10-19',
    to: '2026-10-25',
    days: { thisPeriod: '5/7 days kept (71%)', change: 'down 15 points from the previous period' },
    findings: ['[anchor habit] On days you do Run, you also do Study 96% of the time, vs 0% without it.'],
    playerWriting: { journal: [{ day: '2026-10-21', text: 'Meetings ran late.' }] },
  });
  const sentData = () => JSON.parse(JSON.parse(sent.at(-1)!.body).messages[1].content.slice('Data:'.length + 1));
  const sentPrompt = () => JSON.parse(sent.at(-1)!.body).messages[0].content as string;

  it("uses the app's analysis with the right prompt, and keeps writing private unless allowed", () => {
    const r = report.generateFor('u1', { period: 'week', input: appInput('week') });
    expect(r).toMatchObject({ period: 'week', through: '2026-10-25' });
    expect(sentPrompt()).toMatch(/^You are "the System"[\s\S]*KEEP:/);
    expect(sentData().findings[0]).toMatch(/anchor habit/);
    expect(sentData().playerWriting).toBeUndefined();

    db.reports = [];
    db.settings[0].data.ai_reads_writing = true;
    report.generateFor('u1', { period: 'month', input: appInput('month') });
    expect(sentPrompt()).toMatch(/SEASON VERDICT/);
    expect(sentData().playerWriting.journal[0].text).toBe('Meetings ran late.');
  });

  it('writes the Season report from the analysis the app saved, and only then', () => {
    report.generateMonthly();
    expect(db.reports).toHaveLength(0);
    db.events.push(record('events', { owner: 'u1', kind: 'report_input', ref: 'month', data_json: JSON.stringify(appInput('month')), created: '2026-11-01 08:00:00' }));
    report.generateMonthly();
    report.generateMonthly();
    expect(db.reports).toHaveLength(1);
    expect(db.reports[0].data).toMatchObject({ period: 'month', through: '2026-10-25' });
  });
});

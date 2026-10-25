import { describe, expect, it } from 'vitest';

import { analyze, type AnalysisInput } from './analysis';
import { dayRange, weekday } from './day';
import { computeState, daysToClose, evaluateDay } from './state';
import type { Habit, LogEntry } from './types';

const habit = (id: string, name: string, over: Partial<Habit> = {}): Habit => ({
  id,
  name,
  stat: 'STR',
  target: 10,
  unit: 'reps',
  schedule: 'daily',
  grade: 'D',
  startDay: '2026-09-28',
  archived: false,
  ...over,
});

const TODAY = '2026-10-26';
const days = dayRange('2026-09-28', '2026-10-25');

function setup(habits: Habit[], logs: LogEntry[], extra: Partial<AnalysisInput> = {}) {
  const closedDays = daysToClose(habits, new Set(), TODAY).map((d) => evaluateDay(habits, logs, d));
  const s = computeState({ habits, logs, closedDays, today: TODAY, surprises: false });
  const strength = Object.fromEntries(Object.entries(s.habits).map(([id, h]) => [id, h.strength]));
  return analyze({
    period: 'week',
    from: '2026-10-19',
    to: '2026-10-25',
    today: TODAY,
    history: s.history,
    habits: habits.map((h) => ({ id: h.id, name: h.name, limit: h.limit, archived: h.archived, unit: h.unit, target: h.target })),
    strength,
    logTimes: [],
    journal: [],
    mainQuests: [],
    streak: s.streak,
    longestStreak: s.record.longestStreak,
    ...extra,
  });
}

describe('Hunter Analysis', () => {
  it('finds an anchor habit: studying follows running', () => {
    const run = days.filter((_, i) => i % 3 !== 0);
    const logs: LogEntry[] = [
      ...run.map((d) => ({ habitId: 'run', day: d, amount: 10 })),
      // Study on 3 of 4 run days, rarely otherwise (Run stays the more reliable habit).
      ...days.filter((d, i) => (run.includes(d) ? i % 4 !== 0 : i % 9 === 0)).map((d) => ({ habitId: 'study', day: d, amount: 10 })),
    ];
    const a = setup([habit('run', 'Run'), habit('study', 'Study')], logs);
    expect(a.pairs[0]).toMatchObject({ anchor: 'Run', follower: 'Study' });
    expect(a.insights.some((i) => i.kind === 'pair' && i.text.startsWith('On days you do Run'))).toBe(true);
  });

  it('finds a weak weekday, the usual time slot and reliance on minimums', () => {
    const logs: LogEntry[] = days.filter((d) => weekday(d) !== 4).map((d, i) => ({ habitId: 'p', day: d, amount: i % 2 ? 10 : 4 }));
    const logTimes = days.map((d) => ({ habitId: 'p', day: d, hour: 7 }));
    const a = setup([habit('p', 'Push-ups', { minTarget: 3 })], logs, { logTimes });
    const p = a.habits[0];
    expect(p.worstDay).toBe('Thursday');
    expect(p.timeWindow).toEqual({ label: '06:00–08:00', share: 1 });
    expect(p.minimumShare).toBeGreaterThan(0.4);
    expect(a.insights.map((i) => i.kind)).toEqual(expect.arrayContaining(['weekday', 'time', 'minimum']));
  });

  it('links screen time to missed quests', () => {
    const phone = habit('phone', 'Phone under 3 h', { limit: true, target: 180, unit: 'min' });
    const over = new Set(days.filter((_, i) => i % 4 === 0));
    const logs: LogEntry[] = [
      ...days.map((d) => ({ habitId: 'phone', day: d, amount: over.has(d) ? 240 : 120 })),
      ...days.filter((d) => !over.has(d)).map((d) => ({ habitId: 'read', day: d, amount: 10 })),
    ];
    const a = setup([phone, habit('read', 'Read')], logs);
    expect(a.screenTime).toMatchObject({ name: 'Phone under 3 h', missedWhenOver: 1, missedWhenUnder: 0 });
    expect(a.insights[0].kind).toBe('screen');
  });

  it('connects journal mood to habits and projects Main Quest finish', () => {
    const med = days.filter((_, i) => i % 2 === 0);
    const logs = med.map((d) => ({ habitId: 'm', day: d, amount: 10 }));
    const journal = days.map((d) => ({ day: d, mood: med.includes(d) ? 4 : 3, energy: null }));
    const a = setup([habit('m', 'Meditate')], logs, {
      journal,
      mainQuests: [{ name: 'Learn GenAI', doneDays: ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-24'], remaining: 6 }],
    });
    expect(a.mood.byHabit[0]).toEqual({ name: 'Meditate', kept: 4, missed: 3 });
    expect(a.insights.some((i) => i.text === 'Mood averaged 4 on days you did Meditate, vs 3 on days you didn’t.'.replace('’', "'"))).toBe(true);
    expect(a.mainQuests[0]).toEqual({ name: 'Learn GenAI', perWeek: 1, remaining: 6, eta: '2026-12-07' });
  });
});

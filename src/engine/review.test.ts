import { describe, expect, it } from 'vitest';

import { dayRange, weekday } from './day';
import { findPatterns, reviewDue, reviewWeek, weekSummary } from './review';
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
  startDay: '2026-09-07',
  archived: false,
  ...over,
});

function run(habits: Habit[], logs: LogEntry[], today: string) {
  const closedDays = daysToClose(habits, new Set(), today).map((d) => evaluateDay(habits, logs, d));
  return computeState({ habits, logs, closedDays, today, surprises: false });
}

describe('weekly review', () => {
  it('covers the current week on Sunday and the previous one on Monday', () => {
    expect(weekday('2026-10-25')).toBe(0);
    expect(reviewWeek('2026-10-25')).toBe('2026-10-19');
    expect(reviewWeek('2026-10-26')).toBe('2026-10-19');
    expect(reviewDue('2026-10-25')).toBe(true);
    expect(reviewDue('2026-10-26')).toBe(true);
    expect(reviewDue('2026-10-28')).toBe(false);
  });

  it('summarises a week per quest, counting minimums', () => {
    const habits = [habit('a', 'Push-ups', { minTarget: 3 }), habit('b', 'Read')];
    const days = dayRange('2026-10-19', '2026-10-25');
    const logs: LogEntry[] = [
      ...days.map((d, i) => ({ habitId: 'a', day: d, amount: i === 2 ? 4 : 10 })),
      ...days.filter((_, i) => i % 2 === 0).map((d) => ({ habitId: 'b', day: d, amount: 10 })),
    ];
    const s = run(habits, logs, '2026-10-26');
    const w = weekSummary(s.history, '2026-10-19');
    expect(w.days).toBe(7);
    expect(w.quests.find((q) => q.name === 'Push-ups')).toEqual({ name: 'Push-ups', kept: 7, minimum: 1, missed: 0 });
    expect(w.quests.find((q) => q.name === 'Read')).toEqual({ name: 'Read', kept: 4, minimum: 0, missed: 3 });
    expect(w.quests[0].name).toBe('Read');
  });
});

describe('patterns', () => {
  it('finds a weak weekday and a struggling quest', () => {
    const habits = [habit('a', 'Push-ups'), habit('b', 'Run')];
    const days = dayRange('2026-09-07', '2026-10-25');
    // Push-ups every day except Fridays; Run only on even dates.
    const logs: LogEntry[] = [
      ...days.filter((d) => weekday(d) !== 5).map((d) => ({ habitId: 'a', day: d, amount: 10 })),
      ...days.filter((d) => Number(d.slice(-2)) % 2 === 0).map((d) => ({ habitId: 'b', day: d, amount: 10 })),
    ];
    const s = run(habits, logs, '2026-10-26');
    const p = findPatterns(s.history, '2026-10-26');
    expect(p.weakestDay).toBe(5);
    expect(p.quests.find((q) => q.name === 'Push-ups')!.weakDay).toBe(5);
    expect(p.quests[0].name).toBe('Run');
    expect(p.suggestions[0]).toMatch(/^Fridays are your weak day/);
    expect(p.suggestions.some((x) => x.startsWith('Run is kept'))).toBe(true);
  });

  it('suggests raising the bar when nothing is missed', () => {
    const habits = [habit('a', 'Push-ups')];
    const logs = dayRange('2026-09-07', '2026-10-25').map((d) => ({ habitId: 'a', day: d, amount: 10 }));
    const p = findPatterns(run(habits, logs, '2026-10-26').history, '2026-10-26');
    expect(p.weakestDay).toBeNull();
    expect(p.suggestions.join(' ')).toMatch(/nearly automatic/);
    expect(p.suggestions.join(' ')).toMatch(/No misses/);
  });
});

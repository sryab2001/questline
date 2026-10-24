import { describe, expect, it } from 'vitest';

import { computeState, daysToClose, evaluateDay } from './state';
import type { Habit, LogEntry } from './types';

const phone = (over: Partial<Habit> = {}): Habit => ({
  id: 'phone',
  name: 'Phone under 3 h',
  stat: 'SENSE',
  target: 180,
  unit: 'min',
  schedule: 'daily',
  grade: 'C',
  startDay: '2026-10-05',
  archived: false,
  limit: true,
  ...over,
});
const used = (day: string, minutes: number): LogEntry => ({ habitId: 'phone', day, amount: minutes });

function run(habits: Habit[], logs: LogEntry[], today: string) {
  const closedDays = daysToClose(habits, new Set(), today).map((d) => evaluateDay(habits, logs, d));
  return computeState({ habits, logs, closedDays, today, surprises: false });
}

describe('Limit Quests (screen time)', () => {
  it('are kept at or under the limit and missed above it', () => {
    const s = run([phone()], [used('2026-10-05', 120), used('2026-10-06', 180), used('2026-10-07', 240)], '2026-10-08');
    expect(s.history.map((d) => d.kind)).toEqual(['cleared', 'cleared', 'slip']);
  });

  it('leave out days with no reading instead of rewarding or punishing them', () => {
    const habits = [phone()];
    const logs = [used('2026-10-05', 100), used('2026-10-07', 100)];
    expect(evaluateDay(habits, logs, '2026-10-06').goals).toHaveLength(0);
    const s = run(habits, logs, '2026-10-08');
    expect(s.history.map((d) => d.kind)).toEqual(['cleared', 'empty', 'cleared']);
    // A zero reading still counts as measured.
    expect(evaluateDay(habits, [used('2026-10-06', 0)], '2026-10-06').goals[0]).toMatchObject({ done: true });
  });

  it('show today as on track until the limit is passed', () => {
    const under = run([phone()], [used('2026-10-05', 90)], '2026-10-05');
    expect(under.today.goals[0]).toMatchObject({ limit: true, progress: 90, done: true });
    const over = run([phone()], [used('2026-10-05', 200)], '2026-10-05');
    expect(over.today.goals[0]).toMatchObject({ done: false, min: false });
  });

  it('get no upgrade offers and no Record milestones, but do get averages', () => {
    const logs = Array.from({ length: 20 }, (_, i) => used(`2026-10-${String(5 + i).padStart(2, '0')}`, 100));
    const s = run([phone({ minTarget: 60 })], logs, '2026-10-25');
    expect(s.offers).toHaveLength(0);
    expect(s.record.milestones).toHaveLength(0);
    expect(s.record.habits[0]).toMatchObject({ limit: true, last30: 2000, daysLast30: 20, daysDone: 20 });
  });
});

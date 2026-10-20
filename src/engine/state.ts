import { addDays, type DayKey, dayRange, weekday } from './day';
import { levelFromTotalXp, rankForLevel } from './level';
import {
  BASE_STAT,
  CLEARED_DAY_HP_GAIN,
  COMPLETIONS_PER_STAT_POINT,
  DAILY_CLEAR_BONUS_XP,
  FAILED_DAY_HP_LOSS,
  FAILED_DAY_PENALTY_XP,
  GOAL_XP,
  MAX_HP,
  type Stat,
  STATS,
} from './rules';
import type {
  DayOutcome,
  DaySummary,
  EngineInput,
  GoalOutcome,
  GoalProgress,
  Habit,
  LogEntry,
  PlayerState,
} from './types';

export function isScheduled(habit: Habit, day: DayKey): boolean {
  if (habit.archived || day < habit.startDay) return false;
  if (habit.schedule === 'daily') return true;
  return habit.schedule.split(',').map(Number).includes(weekday(day));
}

/** Total logged for one habit on one day (never below zero). */
export function progressFor(logs: LogEntry[], habitId: string, day: DayKey): number {
  let sum = 0;
  for (const l of logs) if (l.habitId === habitId && l.day === day) sum += l.amount;
  return Math.max(0, sum);
}

/** Freezes a day's result from the habits and logs as they are now. */
export function evaluateDay(habits: Habit[], logs: LogEntry[], day: DayKey): DayOutcome {
  return {
    day,
    goals: habits
      .filter((h) => isScheduled(h, day))
      .map((h) => ({
        habitId: h.id,
        name: h.name,
        stat: h.stat,
        grade: h.grade,
        done: progressFor(logs, h.id, day) >= h.target,
      })),
  };
}

/** Days before `today` that still need closing, oldest first. */
export function daysToClose(habits: Habit[], closed: Set<DayKey>, today: DayKey): DayKey[] {
  const active = habits.filter((h) => !h.archived);
  if (active.length === 0) return [];
  const first = active.reduce<DayKey>((min, h) => (h.startDay < min ? h.startDay : min), today);
  return dayRange(first, addDays(today, -1)).filter((d) => !closed.has(d));
}

function goalXp(goals: GoalOutcome[] | GoalProgress[], grades: Map<string, GoalOutcome['grade']>) {
  let xp = 0;
  for (const g of goals) if (g.done) xp += GOAL_XP[grades.get(g.habitId) ?? 'E'];
  return xp;
}

export function computeState({ habits, logs, closedDays, today }: EngineInput): PlayerState {
  let totalXp = 0;
  let hp = MAX_HP;
  const completions: Record<Stat, number> = { STR: 0, AGI: 0, STA: 0, INT: 0, SENSE: 0 };
  const history: DaySummary[] = [];

  const closed = closedDays.filter((d) => d.day < today).sort((a, b) => (a.day < b.day ? -1 : 1));

  for (const { day, goals } of closed) {
    const grades = new Map(goals.map((g) => [g.habitId, g.grade]));
    const cleared = goals.filter((g) => g.done).length;
    const total = goals.length;
    const failed = total > 0 && cleared < total;

    let xpGained = goalXp(goals, grades);
    if (total > 0 && !failed) xpGained += DAILY_CLEAR_BONUS_XP;
    for (const g of goals) if (g.done) completions[g.stat] += 1;
    totalXp += xpGained;

    let xpLost = 0;
    let hpChange = 0;
    if (failed) {
      const { xpIntoLevel } = levelFromTotalXp(totalXp);
      xpLost = Math.min(FAILED_DAY_PENALTY_XP, xpIntoLevel);
      totalXp -= xpLost;
      hpChange = -Math.min(FAILED_DAY_HP_LOSS, hp);
    } else if (total > 0) {
      hpChange = Math.min(CLEARED_DAY_HP_GAIN, MAX_HP - hp);
    }
    hp += hpChange;

    history.push({
      day,
      cleared,
      total,
      failed,
      xpGained,
      xpLost,
      hpChange,
      missed: goals.filter((g) => !g.done).map((g) => g.name),
    });
  }

  // Today is provisional: its EXP counts now, its penalty only once it closes.
  const goals: GoalProgress[] = habits
    .filter((h) => isScheduled(h, today))
    .map((h) => {
      const progress = progressFor(logs, h.id, today);
      return { habitId: h.id, name: h.name, stat: h.stat, unit: h.unit, progress, target: h.target, done: progress >= h.target };
    });
  const clearedToday = goals.filter((g) => g.done).length;
  const allCleared = goals.length > 0 && clearedToday === goals.length;
  totalXp += goalXp(goals, new Map(habits.map((h) => [h.id, h.grade])));
  if (allCleared) totalXp += DAILY_CLEAR_BONUS_XP;
  for (const g of goals) if (g.done) completions[g.stat] += 1;

  const { level, xpIntoLevel, xpForNext } = levelFromTotalXp(totalXp);

  const stats = {} as Record<Stat, number>;
  for (const stat of STATS) {
    stats[stat] = BASE_STAT + (level - 1) + Math.floor(completions[stat] / COMPLETIONS_PER_STAT_POINT);
  }

  // Days with nothing scheduled neither extend nor break the streak.
  let streak = allCleared ? 1 : 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const d = history[i];
    if (d.total === 0) continue;
    if (d.failed) break;
    streak += 1;
  }

  return {
    totalXp,
    level,
    xpIntoLevel,
    xpForNext,
    rank: rankForLevel(level),
    stats,
    hp,
    maxHp: MAX_HP,
    streak,
    history,
    today: { goals, cleared: clearedToday, total: goals.length, allCleared },
  };
}

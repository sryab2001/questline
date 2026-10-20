import { addDays, type DayKey, dayRange, weekday } from './day';
import { levelFromTotalXp, rankForLevel } from './level';
import {
  BASE_STAT,
  COMPLETIONS_PER_STAT_POINT,
  DAILY_CLEAR_BONUS_XP,
  GOAL_XP,
  type Stat,
  STATS,
} from './rules';
import type { EngineInput, GoalProgress, Habit, LogEntry, PlayerState } from './types';

export function isScheduled(habit: Habit, day: DayKey): boolean {
  if (habit.archived || day < habit.startDay) return false;
  if (habit.schedule === 'daily') return true;
  return habit.schedule.split(',').map(Number).includes(weekday(day));
}

/** Sum of logged amounts per `habitId|day`. */
function totalsByHabitDay(logs: LogEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const log of logs) {
    const key = `${log.habitId}|${log.day}`;
    totals.set(key, (totals.get(key) ?? 0) + log.amount);
  }
  return totals;
}

export function computeState({ habits, logs, today }: EngineInput): PlayerState {
  const totals = totalsByHabitDay(logs);
  const progressOf = (habitId: string, day: DayKey) => totals.get(`${habitId}|${day}`) ?? 0;

  const firstDay = habits.reduce<DayKey>((min, h) => (h.startDay < min ? h.startDay : min), today);

  let totalXp = 0;
  const completionsByStat: Record<Stat, number> = { STR: 0, AGI: 0, STA: 0, INT: 0, SENSE: 0 };
  const clearedDays = new Set<DayKey>();

  for (const day of dayRange(firstDay, today)) {
    const scheduled = habits.filter((h) => isScheduled(h, day));
    let cleared = 0;
    for (const habit of scheduled) {
      if (progressOf(habit.id, day) >= habit.target) {
        cleared += 1;
        totalXp += GOAL_XP[habit.grade];
        completionsByStat[habit.stat] += 1;
      }
    }
    if (scheduled.length > 0 && cleared === scheduled.length) {
      clearedDays.add(day);
      totalXp += DAILY_CLEAR_BONUS_XP;
    }
  }

  const { level, xpIntoLevel, xpForNext } = levelFromTotalXp(totalXp);

  const stats = {} as Record<Stat, number>;
  for (const stat of STATS) {
    stats[stat] = BASE_STAT + (level - 1) + Math.floor(completionsByStat[stat] / COMPLETIONS_PER_STAT_POINT);
  }

  // Today doesn't break the streak until it is over.
  let streak = 0;
  for (let day = clearedDays.has(today) ? today : addDays(today, -1); clearedDays.has(day); day = addDays(day, -1)) {
    streak += 1;
  }

  const goals: GoalProgress[] = habits
    .filter((h) => isScheduled(h, today))
    .map((h) => {
      const progress = progressOf(h.id, today);
      return {
        habitId: h.id,
        name: h.name,
        stat: h.stat,
        unit: h.unit,
        progress,
        target: h.target,
        done: progress >= h.target,
      };
    });
  const cleared = goals.filter((g) => g.done).length;

  return {
    totalXp,
    level,
    xpIntoLevel,
    xpForNext,
    rank: rankForLevel(level),
    stats,
    streak,
    today: { goals, cleared, total: goals.length, allCleared: goals.length > 0 && cleared === goals.length },
  };
}

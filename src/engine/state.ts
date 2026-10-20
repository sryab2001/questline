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
  GOLD_DAILY_CLEAR,
  GOLD_PER_GOAL,
  MAX_HP,
  MAX_MP,
  MP_PER_GOAL,
  POINTS_PER_DAILY_CLEAR,
  type SkillId,
  SKILLS,
  type Stat,
  STATS,
  SURVIVAL_PENALTY_FACTOR,
} from './rules';
import type {
  DayOutcome,
  DaySummary,
  EngineInput,
  GoalProgress,
  Habit,
  LogEntry,
  PlayerState,
  Purchase,
  SkillUse,
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

function groupByDay<T extends { day: DayKey }>(items: T[]): Map<DayKey, T[]> {
  const map = new Map<DayKey, T[]>();
  for (const it of items) map.set(it.day, [...(map.get(it.day) ?? []), it]);
  return map;
}

export function computeState({
  habits,
  logs,
  closedDays,
  today,
  purchases = [],
  skillUses = [],
  allocations = [],
}: EngineInput): PlayerState {
  let totalXp = 0;
  let hp = MAX_HP;
  let mp = MAX_MP;
  let goldEarned = 0;
  let goldSpent = 0;
  let pointsEarned = 0;
  let shieldsGained = 0;
  let shieldsUsed = 0;
  const completions: Record<Stat, number> = { STR: 0, AGI: 0, STA: 0, INT: 0, SENSE: 0 };
  const history: DaySummary[] = [];

  const closedByDay = new Map(closedDays.filter((d) => d.day < today).map((d) => [d.day, d]));
  const purchasesByDay = groupByDay<Purchase>(purchases.filter((p) => p.day <= today));
  const skillsByDay = groupByDay<SkillUse>(skillUses.filter((s) => s.day <= today));
  const used = (day: DayKey, skill: SkillId) => (skillsByDay.get(day) ?? []).some((s) => s.skill === skill);

  /** Store purchases and skill costs for one day. */
  const applyDayEvents = (day: DayKey) => {
    for (const p of purchasesByDay.get(day) ?? []) {
      goldSpent += p.cost;
      if (p.kind === 'shield' || p.result?.type === 'shield') shieldsGained += 1;
      if (p.result?.type === 'gold') goldEarned += p.result.amount;
      if (p.result?.type === 'mp') mp = Math.min(MAX_MP, mp + p.result.amount);
    }
    for (const s of skillsByDay.get(day) ?? []) mp = Math.max(0, mp - SKILLS[s.skill].mpCost);
  };

  const eventDays = [...closedByDay.keys(), ...purchasesByDay.keys(), ...skillsByDay.keys()].filter((d) => d < today);
  for (const day of [...new Set(eventDays)].sort()) {
    applyDayEvents(day);
    const outcome = closedByDay.get(day);
    if (!outcome) continue;

    const { goals, survival = null } = outcome;
    const cleared = goals.filter((g) => g.done).length;
    const total = goals.length;
    const failed = total > 0 && cleared < total;
    const rested = used(day, 'rest_day');

    let xpGained = 0;
    let goldGained = 0;
    for (const g of goals) {
      if (!g.done) continue;
      xpGained += GOAL_XP[g.grade];
      goldGained += GOLD_PER_GOAL;
      completions[g.stat] += 1;
      mp = Math.min(MAX_MP, mp + MP_PER_GOAL);
    }
    if (total > 0 && !failed) {
      xpGained += DAILY_CLEAR_BONUS_XP;
      goldGained += GOLD_DAILY_CLEAR;
      pointsEarned += POINTS_PER_DAILY_CLEAR;
    }
    totalXp += xpGained;
    goldEarned += goldGained;

    let xpLost = 0;
    let hpChange = 0;
    let shielded = false;
    if (failed && !rested) {
      if (shieldsGained - shieldsUsed > 0) {
        shieldsUsed += 1;
        shielded = true;
      } else {
        const factor = survival === 'cleared' ? SURVIVAL_PENALTY_FACTOR : 1;
        const { xpIntoLevel } = levelFromTotalXp(totalXp);
        xpLost = Math.min(Math.round(FAILED_DAY_PENALTY_XP * factor), xpIntoLevel);
        totalXp -= xpLost;
        hpChange = -Math.min(Math.round(FAILED_DAY_HP_LOSS * factor), hp);
      }
    } else if (total > 0 && !failed) {
      hpChange = Math.min(CLEARED_DAY_HP_GAIN, MAX_HP - hp);
    }
    hp += hpChange;

    history.push({
      day,
      cleared,
      total,
      failed,
      shielded,
      rested,
      survival,
      xpGained,
      xpLost,
      goldGained,
      hpChange,
      missed: goals.filter((g) => !g.done).map((g) => g.name),
      done: goals.filter((g) => g.done).map((g) => g.name),
    });
  }

  // Today is provisional: its rewards count now, its penalty only once it closes.
  applyDayEvents(today);
  const goals: GoalProgress[] = habits
    .filter((h) => isScheduled(h, today))
    .map((h) => {
      const progress = progressFor(logs, h.id, today);
      return { habitId: h.id, name: h.name, stat: h.stat, unit: h.unit, progress, target: h.target, done: progress >= h.target };
    });
  const grades = new Map(habits.map((h) => [h.id, h.grade]));
  const clearedToday = goals.filter((g) => g.done).length;
  const allCleared = goals.length > 0 && clearedToday === goals.length;
  for (const g of goals) {
    if (!g.done) continue;
    totalXp += GOAL_XP[grades.get(g.habitId) ?? 'E'];
    goldEarned += GOLD_PER_GOAL;
    completions[g.stat] += 1;
    mp = Math.min(MAX_MP, mp + MP_PER_GOAL);
  }
  if (allCleared) {
    totalXp += DAILY_CLEAR_BONUS_XP;
    goldEarned += GOLD_DAILY_CLEAR;
    pointsEarned += POINTS_PER_DAILY_CLEAR;
  }

  const { level, xpIntoLevel, xpForNext } = levelFromTotalXp(totalXp);

  const allocated: Record<Stat, number> = { STR: 0, AGI: 0, STA: 0, INT: 0, SENSE: 0 };
  for (const a of allocations) allocated[a.stat] += a.points;
  const pointsSpent = allocations.reduce((s, a) => s + a.points, 0);

  const stats = {} as Record<Stat, number>;
  for (const stat of STATS) {
    stats[stat] =
      BASE_STAT + (level - 1) + Math.floor(completions[stat] / COMPLETIONS_PER_STAT_POINT) + allocated[stat];
  }

  // Rest days, shielded days and days with nothing scheduled neither extend nor break the streak.
  let streak = allCleared ? 1 : 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const d = history[i];
    if (d.total === 0 || d.rested || d.shielded) continue;
    if (d.failed) break;
    streak += 1;
  }

  const restedToday = used(today, 'rest_day');
  const skills = {} as PlayerState['skills'];
  for (const id of Object.keys(SKILLS) as SkillId[]) {
    const unlocked = level >= SKILLS[id].unlockLevel;
    const activeToday = used(today, id);
    skills[id] = {
      unlocked,
      activeToday,
      canUse: unlocked && !activeToday && mp >= SKILLS[id].mpCost && goals.length > 0 && !allCleared,
    };
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
    mp,
    maxMp: MAX_MP,
    gold: goldEarned - goldSpent,
    abilityPoints: { earned: pointsEarned, spent: pointsSpent, available: pointsEarned - pointsSpent },
    shields: shieldsGained - shieldsUsed,
    streak,
    history,
    skills,
    today: { goals, cleared: clearedToday, total: goals.length, allCleared, rested: restedToday },
  };
}

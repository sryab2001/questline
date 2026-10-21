import { addDays, type DayKey, dayRange, daysBetween, weekday } from './day';
import { clearDrop, type Drop, goalDrop, isCritical, urgentDrop } from './drops';
import { levelFromTotalXp, rankForLevel } from './level';
import {
  BASE_STAT,
  CHECKIN_INTERVAL_DAYS,
  CHECKIN_MIN_STRENGTH,
  CLEARED_DAY_HP_GAIN,
  COMEBACK_BONUS,
  COMPLETIONS_PER_STAT_POINT,
  DAILY_CLEAR_BONUS_XP,
  DOWNGRADE_FACTOR,
  DOWNGRADE_MISSES_IN_7,
  FAILED_DAY_HP_LOSS,
  FAILED_DAY_PENALTY_XP,
  GATE_DAYS_REQUIRED,
  GATE_REWARD,
  GOAL_XP,
  GOLD_DAILY_CLEAR,
  GOLD_PER_GOAL,
  type Grade,
  MASTERED_XP_FACTOR,
  MASTERY_MIN_CHECKIN,
  MASTERY_MIN_STRENGTH,
  MAX_HP,
  MAX_MP,
  MIN_CLEAR_REWARD,
  MIN_CLEAR_STRENGTH,
  MP_PER_GOAL,
  OFFER_COOLDOWN_DAYS,
  PASSIVE_STAT_BONUS,
  POINTS_PER_DAILY_CLEAR,
  SEASON_TITLES,
  type SkillId,
  SKILLS,
  SLIP_PENALTY_FACTOR,
  type Stat,
  STATS,
  STRENGTH_GROWTH,
  STRENGTH_MISS_DECAY,
  STREAK_MILESTONES,
  SURVIVAL_PENALTY_FACTOR,
  UPGRADE_AFTER_CLEAN_DAYS,
  UPGRADE_FACTOR,
  URGENT_REWARD,
  WEAKENED_BELOW,
} from './rules';
import type {
  DayKind,
  DayOutcome,
  DaySummary,
  EngineInput,
  GateState,
  GoalOutcome,
  GoalProgress,
  Habit,
  HabitStat,
  LogEntry,
  PlayerState,
  Purchase,
  QuestOffer,
  SkillUse,
  StrengthChange,
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

function reachedMin(h: Habit, progress: number): boolean {
  return !!h.minTarget && h.minTarget > 0 && progress >= h.minTarget && progress < h.target;
}

/** Freezes a day's result from the habits and logs as they are now. */
export function evaluateDay(habits: Habit[], logs: LogEntry[], day: DayKey): DayOutcome {
  return {
    day,
    goals: habits
      .filter((h) => isScheduled(h, day))
      .map((h) => {
        const progress = progressFor(logs, h.id, day);
        const done = progress >= h.target;
        return {
          habitId: h.id,
          name: h.name,
          stat: h.stat,
          grade: h.grade,
          done,
          min: !done && reachedMin(h, progress),
          mastered: !!h.mastered,
        };
      }),
  };
}

/** Days before `today` that still need closing, oldest first. */
export function daysToClose(habits: Habit[], closed: Set<DayKey>, today: DayKey): DayKey[] {
  const active = habits.filter((h) => !h.archived);
  if (active.length === 0) return [];
  const first = active.reduce<DayKey>((min, h) => (h.startDay < min ? h.startDay : min), today);
  return dayRange(first, addDays(today, -1)).filter((d) => !closed.has(d));
}

/** Monday of the week containing `day`. */
export function weekStart(day: DayKey): DayKey {
  return addDays(day, -((weekday(day) + 6) % 7));
}

/** Rounds a new target to something a person would pick. */
export function niceTarget(n: number): number {
  if (n >= 20) return Math.max(5, Math.round(n / 5) * 5);
  if (n >= 3) return Math.max(1, Math.round(n));
  return Math.max(0.5, Math.round(n * 2) / 2);
}

function groupByDay<T extends { day: DayKey }>(items: T[]): Map<DayKey, T[]> {
  const map = new Map<DayKey, T[]>();
  for (const it of items) map.set(it.day, [...(map.get(it.day) ?? []), it]);
  return map;
}

const MISSED_KINDS: DayKind[] = ['slip', 'failure', 'shielded'];
const KEPT_KINDS: DayKind[] = ['cleared', 'min'];

export function computeState({
  habits,
  logs,
  closedDays,
  today,
  purchases = [],
  skillUses = [],
  allocations = [],
  checkins = [],
  decisions = [],
  surprises = true,
  urgentCleared = [],
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

  // Habit strength, tracked per quest as days are replayed.
  const strength = new Map<string, number>();
  const missRun = new Map<string, number>();
  const doneCount = new Map<string, number>();
  const grow = (id: string, share: number) => {
    const s = strength.get(id) ?? 0;
    strength.set(id, s + (100 - s) * STRENGTH_GROWTH * share);
    missRun.set(id, 0);
  };
  const decay = (id: string) => {
    const run = (missRun.get(id) ?? 0) + 1;
    missRun.set(id, run);
    strength.set(id, (strength.get(id) ?? 0) * STRENGTH_MISS_DECAY[Math.min(run, STRENGTH_MISS_DECAY.length) - 1]);
  };
  /** Passive Skill in effect: mastered and not weakened. */
  const activeMastery = (habitId: string, mastered: boolean | undefined) =>
    !!mastered && (strength.get(habitId) ?? 0) >= WEAKENED_BELOW;

  const applyDrop = (d: Drop | null, into: Drop[]) => {
    if (!d || !surprises) return;
    into.push(d);
    if (d.type === 'gold') goldEarned += d.amount;
    if (d.type === 'xp') totalXp += d.amount;
    if (d.type === 'mp') mp = Math.min(MAX_MP, mp + d.amount);
    if (d.type === 'shield') shieldsGained += 1;
  };

  /** Rewards for one goal; returns the EXP and gold it earned. */
  const rewardGoal = (
    g: { habitId: string; stat: Stat; done: boolean; min?: boolean },
    grade: Grade,
    mastered: boolean,
    day: DayKey,
    drops: Drop[],
    criticals: string[],
    name: string,
  ) => {
    const xpFactor = mastered ? MASTERED_XP_FACTOR : 1;
    if (g.done) {
      const crit = surprises && isCritical(g.habitId, day);
      if (crit) criticals.push(name);
      const xp = Math.round(GOAL_XP[grade] * xpFactor * (crit ? 2 : 1));
      completions[g.stat] += 1;
      doneCount.set(g.habitId, (doneCount.get(g.habitId) ?? 0) + 1);
      mp = Math.min(MAX_MP, mp + MP_PER_GOAL);
      applyDrop(goalDrop(g.habitId, day), drops);
      return { xp, gold: GOLD_PER_GOAL };
    }
    if (g.min) {
      return { xp: Math.round(GOAL_XP[grade] * xpFactor * MIN_CLEAR_REWARD), gold: Math.round(GOLD_PER_GOAL * MIN_CLEAR_REWARD) };
    }
    return { xp: 0, gold: 0 };
  };

  const closedByDay = new Map(closedDays.filter((d) => d.day < today).map((d) => [d.day, d]));
  const purchasesByDay = groupByDay<Purchase>(purchases.filter((p) => p.day <= today));
  const skillsByDay = groupByDay<SkillUse>(skillUses.filter((s) => s.day <= today));
  const used = (day: DayKey, skill: SkillId) => (skillsByDay.get(day) ?? []).some((s) => s.skill === skill);
  const urgentDays = new Set(urgentCleared.filter((u) => u.day <= today).map((u) => u.day));

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

  /** Kind of the most recent day that had goals and wasn't a rest day. */
  let lastRelevant: DayKind | null = null;

  const eventDays = [...closedByDay.keys(), ...purchasesByDay.keys(), ...skillsByDay.keys(), ...urgentDays].filter((d) => d < today);
  for (const day of [...new Set(eventDays)].sort()) {
    applyDayEvents(day);
    const outcome = closedByDay.get(day);
    if (!outcome) {
      // An Urgent Quest on a day with no Daily Quest still pays out.
      if (urgentDays.has(day)) {
        totalXp += URGENT_REWARD.xp;
        goldEarned += URGENT_REWARD.gold;
        applyDrop(urgentDrop(day), []);
      }
      continue;
    }

    const { goals, survival = null } = outcome;
    const total = goals.length;
    const full = goals.filter((g) => g.done).length;
    const satisfied = goals.filter((g) => g.done || g.min).length;
    const missedAny = total > 0 && satisfied < total;
    const rested = used(day, 'rest_day');
    const prevMissed: boolean = lastRelevant !== null && MISSED_KINDS.includes(lastRelevant);

    let kind: DayKind;
    if (total === 0) kind = 'empty';
    else if (rested) kind = 'rested';
    else if (!missedAny) kind = full === total ? 'cleared' : 'min';
    else kind = prevMissed ? 'failure' : 'slip';

    // Rewards for what was done (penalties never cancel earned rewards).
    const drops: Drop[] = [];
    const criticals: string[] = [];
    let xpGained = 0;
    let goldGained = 0;
    for (const g of goals) {
      const r = rewardGoal(g, g.grade, activeMastery(g.habitId, g.mastered), day, drops, criticals, g.name);
      xpGained += r.xp;
      goldGained += r.gold;
    }
    if (kind === 'cleared') {
      xpGained += DAILY_CLEAR_BONUS_XP;
      goldGained += GOLD_DAILY_CLEAR;
      pointsEarned += POINTS_PER_DAILY_CLEAR;
      applyDrop(clearDrop(day), drops);
    }
    const comeback = KEPT_KINDS.includes(kind) && prevMissed;
    if (comeback) {
      xpGained += Math.round(xpGained * COMEBACK_BONUS);
      goldGained += Math.round(goldGained * COMEBACK_BONUS);
    }
    // Urgent Quests are a flat bonus, outside every multiplier.
    const urgent = urgentDays.has(day);
    if (urgent) {
      xpGained += URGENT_REWARD.xp;
      goldGained += URGENT_REWARD.gold;
      applyDrop(urgentDrop(day), drops);
    }
    totalXp += xpGained;
    goldEarned += goldGained;

    // Penalties: a Shield absorbs a Failure; a Slip costs half.
    let xpLost = 0;
    let hpChange = 0;
    if (kind === 'failure' && shieldsGained - shieldsUsed > 0) {
      shieldsUsed += 1;
      kind = 'shielded';
    }
    if (kind === 'slip' || kind === 'failure') {
      const factor = (kind === 'slip' ? SLIP_PENALTY_FACTOR : 1) * (survival === 'cleared' ? SURVIVAL_PENALTY_FACTOR : 1);
      const { xpIntoLevel } = levelFromTotalXp(totalXp);
      xpLost = Math.min(Math.round(FAILED_DAY_PENALTY_XP * factor), xpIntoLevel);
      totalXp -= xpLost;
      hpChange = -Math.min(Math.round(FAILED_DAY_HP_LOSS * factor), hp);
    } else if (KEPT_KINDS.includes(kind)) {
      hpChange = Math.min(CLEARED_DAY_HP_GAIN, MAX_HP - hp);
    }
    hp += hpChange;

    // Habit strength follows what actually happened, even when a Shield saved the streak.
    const strengthChanges: StrengthChange[] = [];
    if (!rested) {
      for (const g of goals) {
        const before = strength.get(g.habitId) ?? 0;
        if (g.done) grow(g.habitId, 1);
        else if (g.min) grow(g.habitId, MIN_CLEAR_STRENGTH);
        else decay(g.habitId);
        strengthChanges.push({ habitId: g.habitId, name: g.name, before, after: strength.get(g.habitId) ?? 0 });
      }
    }

    if (kind !== 'empty' && kind !== 'rested') lastRelevant = kind;

    history.push({
      day,
      kind,
      cleared: full,
      total,
      failed: missedAny,
      shielded: kind === 'shielded',
      rested,
      comeback,
      survival,
      xpGained,
      xpLost,
      goldGained,
      hpChange,
      missed: goals.filter((g) => !g.done && !g.min).map((g) => g.name),
      done: goals.filter((g) => g.done || g.min).map((g) => (g.min ? `${g.name} (minimum)` : g.name)),
      drops,
      criticals,
      strength: strengthChanges,
      urgent,
    });
  }

  // ---------- today (provisional: rewards now, penalties only once it closes) ----------
  applyDayEvents(today);
  const restedToday = used(today, 'rest_day');
  const habitById = new Map(habits.map((h) => [h.id, h]));
  const goals: GoalProgress[] = habits
    .filter((h) => isScheduled(h, today))
    .map((h) => {
      const progress = progressFor(logs, h.id, today);
      const done = progress >= h.target;
      const mastered = !!h.mastered;
      return {
        habitId: h.id,
        name: h.name,
        stat: h.stat,
        unit: h.unit,
        progress,
        target: h.target,
        minTarget: h.minTarget ?? null,
        done,
        min: !done && reachedMin(h, progress),
        mastered,
        weakened: mastered && (strength.get(h.id) ?? 0) < WEAKENED_BELOW,
      };
    });
  const clearedToday = goals.filter((g) => g.done).length;
  const allCleared = goals.length > 0 && clearedToday === goals.length;
  const keptToday = goals.length > 0 && goals.every((g) => g.done || g.min);
  const comebackToday = keptToday && !restedToday && lastRelevant !== null && MISSED_KINDS.includes(lastRelevant);

  const todayDrops: Drop[] = [];
  const todayCriticals: string[] = [];
  let todayXp = 0;
  let todayGold = 0;
  for (const g of goals) {
    const h = habitById.get(g.habitId)!;
    const r = rewardGoal(g, h.grade, g.mastered && !g.weakened, today, todayDrops, todayCriticals, g.name);
    todayXp += r.xp;
    todayGold += r.gold;
    if (g.done) grow(g.habitId, 1);
    else if (g.min) grow(g.habitId, MIN_CLEAR_STRENGTH);
  }
  if (allCleared) {
    todayXp += DAILY_CLEAR_BONUS_XP;
    todayGold += GOLD_DAILY_CLEAR;
    pointsEarned += POINTS_PER_DAILY_CLEAR;
    applyDrop(clearDrop(today), todayDrops);
  }
  if (comebackToday) {
    todayXp += Math.round(todayXp * COMEBACK_BONUS);
    todayGold += Math.round(todayGold * COMEBACK_BONUS);
  }
  const urgentToday = urgentDays.has(today);
  if (urgentToday) {
    todayXp += URGENT_REWARD.xp;
    todayGold += URGENT_REWARD.gold;
    applyDrop(urgentDrop(today), todayDrops);
  }
  totalXp += todayXp;
  goldEarned += todayGold;

  // ---------- weekly Gates (every week, past and current) ----------
  const keptByWeek = new Map<DayKey, number>();
  for (const d of history) if (KEPT_KINDS.includes(d.kind)) keptByWeek.set(weekStart(d.day), (keptByWeek.get(weekStart(d.day)) ?? 0) + 1);
  if (keptToday && !restedToday) keptByWeek.set(weekStart(today), (keptByWeek.get(weekStart(today)) ?? 0) + 1);
  for (const kept of keptByWeek.values()) {
    if (kept >= GATE_DAYS_REQUIRED) {
      totalXp += GATE_REWARD.xp;
      goldEarned += GATE_REWARD.gold;
    }
  }
  const thisWeek = weekStart(today);
  const summaryByDay = new Map(history.map((d) => [d.day, d]));
  const gateDays: GateState['days'] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(thisWeek, i);
    if (d > today) return 'open';
    if (d === today) return restedToday ? 'none' : keptToday ? 'kept' : goals.length ? 'open' : 'none';
    const s = summaryByDay.get(d);
    if (!s || s.kind === 'empty' || s.kind === 'rested') return 'none';
    return KEPT_KINDS.includes(s.kind) ? 'kept' : 'missed';
  });
  const keptThisWeek = gateDays.filter((d) => d === 'kept').length;
  const gate: GateState = {
    weekStart: thisWeek,
    kept: keptThisWeek,
    required: GATE_DAYS_REQUIRED,
    complete: keptThisWeek >= GATE_DAYS_REQUIRED,
    days: gateDays,
  };

  // ---------- level, stats ----------
  const { level, xpIntoLevel, xpForNext } = levelFromTotalXp(totalXp);

  const passiveBonus: Record<Stat, number> = { STR: 0, AGI: 0, STA: 0, INT: 0, SENSE: 0 };
  for (const h of habits) {
    if (h.mastered && !h.archived && (strength.get(h.id) ?? 0) >= WEAKENED_BELOW) passiveBonus[h.stat] += PASSIVE_STAT_BONUS;
  }
  const allocated: Record<Stat, number> = { STR: 0, AGI: 0, STA: 0, INT: 0, SENSE: 0 };
  for (const a of allocations) allocated[a.stat] += a.points;
  const pointsSpent = allocations.reduce((s, a) => s + a.points, 0);
  const stats = {} as Record<Stat, number>;
  for (const stat of STATS) {
    stats[stat] =
      BASE_STAT +
      (level - 1) +
      Math.floor(completions[stat] / COMPLETIONS_PER_STAT_POINT) +
      allocated[stat] +
      passiveBonus[stat];
  }

  // ---------- streak: slips, rests and shields bend it, failures break it ----------
  let streak = keptToday && !restedToday ? 1 : 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const k = history[i].kind;
    if (k === 'failure') break;
    if (KEPT_KINDS.includes(k)) streak += 1;
  }
  const streakAtRisk = !keptToday && !restedToday && (lastRelevant === 'slip' || lastRelevant === 'shielded');
  const nextMilestone = STREAK_MILESTONES.find((m) => m > streak) ?? null;

  // ---------- skills ----------
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

  // ---------- per-quest stats: strength, check-ins, mastery ----------
  const latestCheckin = new Map<string, { day: DayKey; avg: number }>();
  for (const c of checkins) {
    const prev = latestCheckin.get(c.habitId);
    if (!prev || c.day > prev.day) latestCheckin.set(c.habitId, { day: c.day, avg: c.avg });
  }
  const recentlyDecided = (habitId: string, kind: string, withinDays: number) =>
    decisions.some((d) => d.habitId === habitId && d.kind === kind && daysBetween(d.day, today) < withinDays);

  const habitStats: Record<string, HabitStat> = {};
  for (const h of habits) {
    const s = Math.round((strength.get(h.id) ?? 0) * 10) / 10;
    const mastered = !!h.mastered;
    const last = latestCheckin.get(h.id);
    const checkinDue = !mastered && s >= CHECKIN_MIN_STRENGTH && (!last || daysBetween(last.day, today) >= CHECKIN_INTERVAL_DAYS);
    const masteryReady =
      !mastered &&
      s >= MASTERY_MIN_STRENGTH &&
      !!last &&
      last.avg >= MASTERY_MIN_CHECKIN &&
      daysBetween(last.day, today) <= 2 * CHECKIN_INTERVAL_DAYS &&
      !recentlyDecided(h.id, 'mastery', OFFER_COOLDOWN_DAYS);
    habitStats[h.id] = {
      strength: s,
      completions: doneCount.get(h.id) ?? 0,
      mastered,
      weakened: mastered && s < WEAKENED_BELOW,
      lastCheckin: last?.avg ?? null,
      checkinDue,
      masteryReady,
    };
  }

  // ---------- quest upgrade / downgrade offers ----------
  const entriesByHabit = new Map<string, GoalOutcome[]>();
  for (const d of [...closedByDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1))) {
    if (used(d.day, 'rest_day')) continue;
    for (const g of d.goals) entriesByHabit.set(g.habitId, [...(entriesByHabit.get(g.habitId) ?? []), g]);
  }
  const offers: QuestOffer[] = [];
  for (const h of habits) {
    if (h.archived || h.mastered) continue;
    const recent = entriesByHabit.get(h.id) ?? [];
    const simpleCheck = h.target === 1 && !h.unit;
    const misses7 = recent.slice(0, 7).filter((g) => !g.done && !g.min).length;
    if (misses7 >= DOWNGRADE_MISSES_IN_7 && !recentlyDecided(h.id, 'down', OFFER_COOLDOWN_DAYS)) {
      const toTarget = simpleCheck ? h.target : Math.min(h.target, niceTarget(h.target * DOWNGRADE_FACTOR));
      offers.push({
        habitId: h.id,
        name: h.name,
        kind: 'down',
        fromTarget: h.target,
        toTarget,
        suggestMin: h.minTarget || simpleCheck ? null : niceTarget(Math.max(1, toTarget * 0.3)),
        unit: h.unit,
      });
    } else if (
      !simpleCheck &&
      recent.length >= UPGRADE_AFTER_CLEAN_DAYS &&
      recent.slice(0, UPGRADE_AFTER_CLEAN_DAYS).every((g) => g.done) &&
      !recentlyDecided(h.id, 'up', OFFER_COOLDOWN_DAYS + 7)
    ) {
      offers.push({
        habitId: h.id,
        name: h.name,
        kind: 'up',
        fromTarget: h.target,
        toTarget: Math.max(h.target + (h.target >= 3 ? 1 : 0.5), niceTarget(h.target * UPGRADE_FACTOR)),
        suggestMin: null,
        unit: h.unit,
      });
    }
  }

  // ---------- Seasons (finished calendar months) ----------
  const keptByMonth = new Map<string, number>();
  for (const d of history) {
    if (KEPT_KINDS.includes(d.kind)) keptByMonth.set(d.day.slice(0, 7), (keptByMonth.get(d.day.slice(0, 7)) ?? 0) + 1);
  }
  const seasonTitles: PlayerState['seasonTitles'] = [];
  for (const [month, keptDays] of [...keptByMonth.entries()].sort()) {
    if (month >= today.slice(0, 7)) continue;
    const t = SEASON_TITLES.find((s) => keptDays >= s.minDays);
    if (t) seasonTitles.push({ month, title: t.title, keptDays });
  }

  return {
    totalXp,
    level,
    xpIntoLevel,
    xpForNext,
    rank: rankForLevel(level),
    stats,
    passiveBonus,
    hp,
    maxHp: MAX_HP,
    mp,
    maxMp: MAX_MP,
    gold: goldEarned - goldSpent,
    abilityPoints: { earned: pointsEarned, spent: pointsSpent, available: pointsEarned - pointsSpent },
    shields: shieldsGained - shieldsUsed,
    streak,
    streakAtRisk,
    nextMilestone,
    history,
    skills,
    habits: habitStats,
    offers,
    gate,
    seasonTitles,
    today: {
      goals,
      cleared: clearedToday,
      total: goals.length,
      allCleared,
      kept: keptToday,
      rested: restedToday,
      comeback: comebackToday,
      drops: todayDrops,
      criticals: todayCriticals,
      urgentCleared: urgentToday,
    },
  };
}

import { ACHIEVEMENT_BY_TITLE, ACHIEVEMENTS, JOB_BY_ID, JOB_CHANGE_LEVEL, JOB_TRIAL_DAYS, JOB_XP_BONUS, JOBS, type Progress } from './achievements';
import { addDays, type DayKey, dayRange, daysBetween, weekday } from './day';
import { clearDrop, type Drop, goalDrop, isCritical, urgentDrop } from './drops';
import { addEffects, emptyModifiers, FORGE_INPUTS, forgeResult, gateItem, type Item, makeItem, type Modifiers, SLOTS, type Slot } from './items';
import { chapterClearedDay, chapterRarity, currentChapter, isMultiChapter, questRarity, questTitle, taskGold, taskXp } from './main-quests';
import { hash } from './random';
import { levelFromTotalXp, rankForLevel } from './level';
import {
  BASE_STAT,
  CHECKIN_INTERVAL_DAYS,
  CHECKIN_MIN_STRENGTH,
  CLEARED_DAY_HP_GAIN,
  COMEBACK_BONUS,
  COMPLETIONS_PER_STAT_POINT,
  DAILY_CLEAR_BONUS_XP,
  DAY_GOLD,
  DAY_GOLD_BASE_XP,
  DAY_GOLD_FACTOR_RANGE,
  DOWNGRADE_FACTOR,
  DROP_GOLD_V2,
  DOWNGRADE_MISSES_IN_7,
  FAILED_DAY_HP_LOSS,
  FAILED_DAY_PENALTY_XP,
  GATE_DAYS_REQUIRED,
  GATE_GOLD_V2,
  GATE_REWARD,
  GOAL_XP,
  GOLD_DAILY_CLEAR,
  GOLD_PER_GOAL,
  type Grade,
  MAIN_QUEST_COMPLETE_XP,
  MAIN_QUEST_STAT_BONUS,
  MASTERED_XP_FACTOR,
  MASTERY_MIN_CHECKIN,
  MASTERY_MIN_STRENGTH,
  MAX_HP,
  MAX_MP,
  MIN_CLEAR_REWARD,
  MIN_CLEAR_STRENGTH,
  MIN_DAY_GOLD_SHARE,
  MISSED_DAY_GOLD_SHARE,
  MP_PER_GOAL,
  OFFER_COOLDOWN_DAYS,
  PASSIVE_STAT_BONUS,
  POINTS_PER_DAILY_CLEAR,
  RARITIES,
  RECORD_MILESTONES,
  SEASON_TITLES,
  SHADOW_NAMES,
  SHADOW_RANKS,
  SHIELD_CAP,
  SHIELD_OVERFLOW_GOLD,
  SHORT_QUEST_COMPLETE_XP,
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
  URGENT_GOLD_V2,
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
  HabitRecord,
  HabitStat,
  LogEntry,
  PlayerState,
  Purchase,
  QuestOffer,
  RecordMilestone,
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
  equips = [],
  titleChanges = [],
  jobChanges = [],
  jobTrials = [],
  mainQuests = [],
  forges = [],
  economyFrom = null,
}: EngineInput): PlayerState {
  /** Economy v2 (gold per kept day) applies from its first day on. */
  const v2 = (day: DayKey) => economyFrom !== null && day >= economyFrom;
  // ---------- Overgeared layer: progression, owned items, timelines ----------
  const progress: Progress = {
    daysCleared: 0,
    maxStreak: 0,
    gatesCleared: 0,
    comebacks: 0,
    survivals: 0,
    minClears: 0,
    masteries: 0,
    legendaryDrops: 0,
    level: 1,
    jobChanged: 0,
    classQuestsDone: 0,
    forged: 0,
  };
  let streakRun = 0;
  let restDays = 0;
  let highGradeClears = 0;
  let allStatsBonus = 0;
  const unlocked = new Map<string, DayKey>();
  const owned = new Map<string, { item: Item; obtainedDay: DayKey; consumedDay?: DayKey }>();
  /** Owned on `day` and not yet used up in the Forge. */
  const holds = (id: string, day: DayKey) => {
    const o = owned.get(id);
    return o && o.obtainedDay <= day && (!o.consumedDay || o.consumedDay > day) ? o : undefined;
  };
  const questStatBonus: Record<Stat, number> = { STR: 0, AGI: 0, STA: 0, INT: 0, SENSE: 0 };
  const own = (item: Item, day: DayKey) => {
    if (!owned.has(item.id)) owned.set(item.id, { item, obtainedDay: day });
  };
  const keptByWeek = new Map<DayKey, number>();
  const gateDaysCleared = new Set<DayKey>();

  /** Last value set on or before `day` (events are in creation order). */
  const timeline = <T extends { day: DayKey }>(events: T[], day: DayKey) => {
    let last: T | undefined;
    for (const e of events) if (e.day <= day) last = e;
    return last;
  };
  const jobOn = (day: DayKey) => {
    const j = timeline(jobChanges, day);
    return j ? (JOB_BY_ID.get(j.jobId) ?? null) : null;
  };
  /** Effects in force on `day`: equipped items owned by then, the equipped title if unlocked by then, and the job. */
  const modsOn = (day: DayKey): Modifiers => {
    const m = emptyModifiers();
    for (const slot of SLOTS) {
      const e = timeline(
        equips.filter((x) => x.slot === slot),
        day,
      );
      const o = e?.itemId ? holds(e.itemId, day) : undefined;
      if (o) addEffects(m, o.item.effects);
    }
    const t = timeline(titleChanges, day);
    const def = t ? ACHIEVEMENT_BY_TITLE.get(t.title) : undefined;
    const unlockedOn = def ? unlocked.get(def.id) : undefined;
    if (def && unlockedOn && unlockedOn <= day) addEffects(m, [def.titleEffect]);
    const job = jobOn(day);
    if (job) m.xpStatPct[job.stat] += JOB_XP_BONUS;
    return m;
  };

  const masteryDays = groupByDay(decisions.filter((d) => d.kind === 'mastery' && d.accepted));
  const jobDays = new Set(jobChanges.map((j) => j.day));
  // Main Quests: each quest pays on the day it was done; a chapter pays an item on
  // its clear day; the whole quest pays its bonus on the day the last chapter clears.
  const questPayDays = new Map<DayKey, { xp: number; gold: number }[]>();
  const chapterClearDays = new Map<DayKey, { id: string; rarity: Item['rarity'] }[]>();
  const questCompleteDay = new Map<string, DayKey>();
  const pushTo = <T>(map: Map<DayKey, T[]>, day: DayKey, v: T) => map.set(day, [...(map.get(day) ?? []), v]);
  for (const q of mainQuests) {
    const multi = isMultiChapter(q.data);
    const cleared = q.data.chapters.map(chapterClearedDay);
    q.data.chapters.forEach((ch, ci) => {
      for (const t of ch.tasks) if (t.doneDay) pushTo(questPayDays, t.doneDay, { xp: taskXp(t), gold: taskGold(t) });
      if (multi && cleared[ci]) pushTo(chapterClearDays, cleared[ci]!, { id: `mq:${q.id}:${ci}`, rarity: chapterRarity(ch) });
    });
    if (cleared.length > 0 && cleared.every(Boolean)) questCompleteDay.set(q.id, [...cleared].sort().at(-1)!);
  }
  const forgesByDay = groupByDay(forges);

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

  const applyDrop = (found: Drop | null, into: Drop[], day: DayKey) => {
    if (!found || !surprises) return;
    let d = found;
    if (v2(day)) {
      // Small gold, and Unique or Legendary drops carry a piece of gear.
      if (d.type === 'gold') d = { ...d, amount: DROP_GOLD_V2[d.rarity] };
      if (RARITIES.indexOf(d.rarity) >= RARITIES.indexOf('Unique')) {
        const item = makeItem(`drop:${d.source}:${day}`, d.rarity);
        own(item, day);
        d = { ...d, itemId: item.id, itemName: item.name };
      }
      if (d.type === 'shield' && shieldsGained - shieldsUsed >= SHIELD_CAP) d = { ...d, type: 'gold', amount: SHIELD_OVERFLOW_GOLD };
    }
    into.push(d);
    if (d.type === 'gold') goldEarned += d.amount;
    if (d.type === 'xp') totalXp += d.amount;
    if (d.type === 'mp') mp = Math.min(MAX_MP, mp + d.amount);
    if (d.type === 'shield') shieldsGained += 1;
  };

  /** Economy v2: one day's gold from how much of it was kept and how hard its quests are. */
  const dayGoldV2 = (goals: { grade: Grade; done: boolean }[], kind: DayKind | null, mods: Modifiers) => {
    if (goals.length === 0 || kind === 'rested' || kind === 'empty') return 0;
    const avgXp = goals.reduce((sum, g) => sum + GOAL_XP[g.grade], 0) / goals.length;
    const [lo, hi] = DAY_GOLD_FACTOR_RANGE;
    const full = DAY_GOLD * Math.min(hi, Math.max(lo, avgXp / DAY_GOLD_BASE_XP));
    if (kind === 'cleared') return Math.round(full);
    if (kind === 'min') return Math.round(full * (MIN_DAY_GOLD_SHARE + mods.minClearPct / 100));
    return Math.round((full * MISSED_DAY_GOLD_SHARE * goals.filter((g) => g.done).length) / goals.length);
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
    mods: Modifiers,
  ) => {
    const xpFactor = (mastered ? MASTERED_XP_FACTOR : 1) * (1 + (mods.xpPct + mods.xpStatPct[g.stat]) / 100);
    if (g.done) {
      const crit = surprises && isCritical(g.habitId, day, mods.critStatPct[g.stat]);
      if (crit) criticals.push(name);
      const xp = Math.round(GOAL_XP[grade] * xpFactor * (crit ? 2 : 1));
      completions[g.stat] += 1;
      doneCount.set(g.habitId, (doneCount.get(g.habitId) ?? 0) + 1);
      mp = Math.min(MAX_MP, mp + MP_PER_GOAL + mods.mpPerGoal);
      applyDrop(goalDrop(g.habitId, day), drops, day);
      return { xp, gold: GOLD_PER_GOAL };
    }
    if (g.min) {
      const share = MIN_CLEAR_REWARD + mods.minClearPct / 100;
      return { xp: Math.round(GOAL_XP[grade] * xpFactor * share), gold: Math.round(GOLD_PER_GOAL * share) };
    }
    return { xp: 0, gold: 0 };
  };

  const closedByDay = new Map(closedDays.filter((d) => d.day < today).map((d) => [d.day, d]));
  const purchasesByDay = groupByDay<Purchase>(purchases.filter((p) => p.day <= today));
  const skillsByDay = groupByDay<SkillUse>(skillUses.filter((s) => s.day <= today));
  const used = (day: DayKey, skill: SkillId) => (skillsByDay.get(day) ?? []).some((s) => s.skill === skill);
  const urgentDays = new Set(urgentCleared.filter((u) => u.day <= today).map((u) => u.day));

  /** Store purchases and skill costs for one day. */
  const applyDayEvents = (day: DayKey, mods: Modifiers) => {
    for (const p of purchasesByDay.get(day) ?? []) {
      goldSpent += p.cost;
      if (p.kind === 'shield' || p.result?.type === 'shield') shieldsGained += 1;
      if (p.result?.type === 'gold') goldEarned += p.result.amount;
      if (p.result?.type === 'mp') mp = Math.min(MAX_MP, mp + p.result.amount);
    }
    for (const s of skillsByDay.get(day) ?? []) mp = Math.max(0, mp - Math.max(0, SKILLS[s.skill].mpCost - mods.restDiscount));
  };

  /**
   * End-of-day progression: streak run, Gates, Class Quest steps, masteries, jobs,
   * level, then any achievements that just unlocked (with their items and bonuses).
   */
  const advance = (
    day: DayKey,
    kind: DayKind | null,
    opts: { comeback: boolean; survival: string | null; drops: Drop[]; goals: { grade: Grade; done: boolean }[] },
  ) => {
    if (kind === 'cleared') progress.daysCleared += 1;
    if (kind === 'cleared' || kind === 'min') {
      streakRun += 1;
      progress.maxStreak = Math.max(progress.maxStreak, streakRun);
      const wk = weekStart(day);
      const n = (keptByWeek.get(wk) ?? 0) + 1;
      keptByWeek.set(wk, n);
      if (n === GATE_DAYS_REQUIRED) {
        progress.gatesCleared += 1;
        totalXp += GATE_REWARD.xp;
        goldEarned += v2(day) ? GATE_GOLD_V2 : GATE_REWARD.gold;
        own(gateItem(wk), day);
        gateDaysCleared.add(day);
      }
    } else if (kind === 'failure') {
      streakRun = 0;
    }
    if (kind === 'min') progress.minClears += 1;
    if (kind === 'rested') restDays += 1;
    if (opts.comeback) progress.comebacks += 1;
    if (opts.survival === 'cleared') progress.survivals += 1;
    if (opts.drops.some((d) => d.rarity === 'Legendary')) progress.legendaryDrops += 1;
    highGradeClears += opts.goals.filter((g) => g.done && (g.grade === 'B' || g.grade === 'A' || g.grade === 'S')).length;
    for (const pay of questPayDays.get(day) ?? []) {
      totalXp += pay.xp;
      goldEarned += pay.gold;
    }
    for (const c of chapterClearDays.get(day) ?? []) own(makeItem(c.id, c.rarity), day);
    for (const q of mainQuests) {
      if (questCompleteDay.get(q.id) !== day) continue;
      const multi = isMultiChapter(q.data);
      progress.classQuestsDone += 1;
      totalXp += multi ? MAIN_QUEST_COMPLETE_XP : SHORT_QUEST_COMPLETE_XP;
      own(makeItem(`mq:${q.id}`, questRarity(q.data)), day);
      if (multi) questStatBonus[q.data.stat] += MAIN_QUEST_STAT_BONUS;
    }
    // The Forge: three same-rarity items held that day become one of the next rarity.
    for (const f of forgesByDay.get(day) ?? []) {
      const inputs = f.inputs.map((id) => holds(id, day));
      if (new Set(f.inputs).size !== FORGE_INPUTS || inputs.length !== FORGE_INPUTS || inputs.some((o) => !o)) continue;
      const rarity = inputs[0]!.item.rarity;
      if (inputs.some((o) => o!.item.rarity !== rarity)) continue;
      const result = forgeResult(f.inputs, rarity);
      if (!result) continue;
      for (const o of inputs) o!.consumedDay = day;
      own(result, day);
      progress.forged += 1;
    }
    progress.masteries += (masteryDays.get(day) ?? []).length;
    if (jobDays.has(day)) progress.jobChanged = 1;
    progress.level = Math.max(progress.level, levelFromTotalXp(totalXp).level);
    for (const a of ACHIEVEMENTS) {
      if (unlocked.has(a.id) || progress[a.metric] < a.target) continue;
      unlocked.set(a.id, day);
      allStatsBonus += a.allStats ?? 0;
      if (a.item) own(makeItem(`ach:${a.id}`, a.item), day);
    }
  };

  /** Kind of the most recent day that had goals and wasn't a rest day. */
  let lastRelevant: DayKind | null = null;

  const eventDays = [
    ...closedByDay.keys(),
    ...purchasesByDay.keys(),
    ...skillsByDay.keys(),
    ...urgentDays,
    ...masteryDays.keys(),
    ...jobDays,
    ...questPayDays.keys(),
    ...forgesByDay.keys(),
  ].filter((d) => d < today);
  const gracedByWeek = new Map<DayKey, number>();
  for (const day of [...new Set(eventDays)].sort()) {
    const mods = modsOn(day);
    applyDayEvents(day, mods);
    const outcome = closedByDay.get(day);
    if (!outcome) {
      // An Urgent Quest on a day with no Daily Quest still pays out.
      const drops: Drop[] = [];
      if (urgentDays.has(day)) {
        totalXp += URGENT_REWARD.xp;
        goldEarned += v2(day) ? URGENT_GOLD_V2 : URGENT_REWARD.gold;
        applyDrop(urgentDrop(day), drops, day);
      }
      advance(day, null, { comeback: false, survival: null, drops, goals: [] });
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
      const r = rewardGoal(g, g.grade, activeMastery(g.habitId, g.mastered), day, drops, criticals, g.name, mods);
      xpGained += r.xp;
      goldGained += r.gold;
    }
    if (kind === 'cleared') {
      xpGained += DAILY_CLEAR_BONUS_XP;
      goldGained += GOLD_DAILY_CLEAR;
      pointsEarned += POINTS_PER_DAILY_CLEAR;
      applyDrop(clearDrop(day), drops, day);
    }
    if (v2(day)) goldGained = dayGoldV2(goals, kind, mods);
    goldGained = Math.round(goldGained * (1 + mods.goldPct / 100));
    const comeback = KEPT_KINDS.includes(kind) && prevMissed;
    if (comeback) {
      xpGained += Math.round(xpGained * COMEBACK_BONUS);
      goldGained += Math.round(goldGained * COMEBACK_BONUS);
    }
    // Urgent Quests are a flat bonus, outside every multiplier.
    const urgent = urgentDays.has(day);
    if (urgent) {
      xpGained += URGENT_REWARD.xp;
      goldGained += v2(day) ? URGENT_GOLD_V2 : URGENT_REWARD.gold;
      applyDrop(urgentDrop(day), drops, day);
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
    // Gear can forgive a slip or two a week: no penalty, and the next miss is a slip again.
    let graced = false;
    if (kind === 'slip') {
      const wk = weekStart(day);
      const usedThisWeek = gracedByWeek.get(wk) ?? 0;
      if (usedThisWeek < mods.graceSlips) {
        gracedByWeek.set(wk, usedThisWeek + 1);
        graced = true;
      }
    }
    if ((kind === 'slip' && !graced) || kind === 'failure') {
      const factor = (kind === 'slip' ? SLIP_PENALTY_FACTOR : 1) * (survival === 'cleared' ? SURVIVAL_PENALTY_FACTOR : 1);
      const { xpIntoLevel } = levelFromTotalXp(totalXp);
      xpLost = Math.min(Math.round(FAILED_DAY_PENALTY_XP * factor), xpIntoLevel);
      totalXp -= xpLost;
      hpChange = -Math.min(Math.round(FAILED_DAY_HP_LOSS * factor), hp);
    } else if (KEPT_KINDS.includes(kind)) {
      hpChange = Math.min(CLEARED_DAY_HP_GAIN + mods.hpPerKept, MAX_HP - hp);
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

    if (kind !== 'empty' && kind !== 'rested' && !graced) lastRelevant = kind;
    advance(day, kind, { comeback, survival, drops, goals });

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
      gateCleared: gateDaysCleared.has(day),
      graced,
    });
  }

  // ---------- today (provisional: rewards now, penalties only once it closes) ----------
  const todayMods = modsOn(today);
  applyDayEvents(today, todayMods);
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
    const r = rewardGoal(g, h.grade, g.mastered && !g.weakened, today, todayDrops, todayCriticals, g.name, todayMods);
    todayXp += r.xp;
    todayGold += r.gold;
    if (g.done) grow(g.habitId, 1);
    else if (g.min) grow(g.habitId, MIN_CLEAR_STRENGTH);
  }
  if (allCleared) {
    todayXp += DAILY_CLEAR_BONUS_XP;
    todayGold += GOLD_DAILY_CLEAR;
    pointsEarned += POINTS_PER_DAILY_CLEAR;
    applyDrop(clearDrop(today), todayDrops, today);
  }
  if (v2(today)) {
    const kindSoFar: DayKind | null = restedToday ? 'rested' : keptToday ? (allCleared ? 'cleared' : 'min') : null;
    todayGold = dayGoldV2(
      goals.map((g) => ({ grade: habitById.get(g.habitId)!.grade, done: g.done })),
      kindSoFar,
      todayMods,
    );
  }
  todayGold = Math.round(todayGold * (1 + todayMods.goldPct / 100));
  if (comebackToday) {
    todayXp += Math.round(todayXp * COMEBACK_BONUS);
    todayGold += Math.round(todayGold * COMEBACK_BONUS);
  }
  const urgentToday = urgentDays.has(today);
  if (urgentToday) {
    todayXp += URGENT_REWARD.xp;
    todayGold += v2(today) ? URGENT_GOLD_V2 : URGENT_REWARD.gold;
    applyDrop(urgentDrop(today), todayDrops, today);
  }
  totalXp += todayXp;
  goldEarned += todayGold;
  // Today's progression is provisional, like its rewards.
  const todayKind: DayKind | null = restedToday ? 'rested' : keptToday ? (allCleared ? 'cleared' : 'min') : null;
  advance(today, todayKind, {
    comeback: comebackToday,
    survival: null,
    drops: todayDrops,
    goals: goals.map((g) => ({ grade: habitById.get(g.habitId)!.grade, done: g.done })),
  });

  // ---------- weekly Gate card ----------
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
      passiveBonus[stat] +
      allStatsBonus +
      questStatBonus[stat];
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
      canUse: unlocked && !activeToday && mp >= Math.max(0, SKILLS[id].mpCost - todayMods.restDiscount) && goals.length > 0 && !allCleared,
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

  // ---------- Overgeared layer outputs ----------
  const achievements = ACHIEVEMENTS.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    progress: Math.min(progress[a.metric], a.target),
    target: a.target,
    unlockedDay: unlocked.get(a.id) ?? null,
    allStats: a.allStats ?? 0,
    itemRarity: a.item ?? null,
  }));
  const inventory = [...owned.values()].filter((o) => !o.consumedDay || o.consumedDay > today).map((o) => ({ ...o.item, obtainedDay: o.obtainedDay }));
  const equipped = {} as Record<Slot, (Item & { obtainedDay: DayKey }) | null>;
  for (const slot of SLOTS) {
    const e = timeline(
      equips.filter((x) => x.slot === slot),
      today,
    );
    const o = e?.itemId ? holds(e.itemId, today) : undefined;
    equipped[slot] = o ? { ...o.item, obtainedDay: o.obtainedDay } : null;
  }
  const titleNow = timeline(titleChanges, today)?.title || null;
  const titleDef = titleNow ? ACHIEVEMENT_BY_TITLE.get(titleNow) : undefined;
  const activeTitle = titleDef && unlocked.has(titleDef.id) ? titleNow : null;

  // Job Change: unlocks at a level; the trial is consecutive kept days after it starts.
  const jobNow = jobOn(today);
  const trialStart = jobTrials.length ? jobTrials[jobTrials.length - 1].day : null;
  let trialRun = 0;
  let trialCleared = false;
  if (trialStart) {
    const days = [...history.filter((d) => d.day >= trialStart).map((d) => d.kind), ...(todayKind ? [todayKind] : [])];
    for (const k of days) {
      if (k === 'cleared' || k === 'min') trialRun += 1;
      else if (k === 'slip' || k === 'failure' || k === 'shielded') trialRun = 0;
      if (trialRun >= JOB_TRIAL_DAYS) trialCleared = true;
    }
  }
  const topStats = [...STATS].sort((a, b) => stats[b] - stats[a]).slice(0, 3);
  const jobChange = {
    unlocked: level >= JOB_CHANGE_LEVEL || !!jobNow,
    unlockLevel: JOB_CHANGE_LEVEL,
    job: jobNow ? { id: jobNow.id, name: jobNow.name, stat: jobNow.stat, description: jobNow.description } : null,
    trialStarted: trialStart,
    trialProgress: trialCleared ? JOB_TRIAL_DAYS : Math.min(trialRun, JOB_TRIAL_DAYS),
    trialNeeded: JOB_TRIAL_DAYS,
    trialCleared,
    options: topStats.map((stat) => ({ ...JOBS[stat], stat })),
  };

  const mainQuestStates = mainQuests.map((q) => {
    const multi = isMultiChapter(q.data);
    const current = currentChapter(q.data);
    const chapters = q.data.chapters.map((ch, ci) => {
      const clearedDay = chapterClearedDay(ch);
      return {
        title: ch.title,
        done: ch.tasks.filter((t) => t.doneDay).length,
        total: ch.tasks.length,
        cleared: !!clearedDay,
        clearedDay,
        unlocked: ci <= current,
        reward: multi ? makeItem(`mq:${q.id}:${ci}`, chapterRarity(ch)) : null,
      };
    });
    return {
      id: q.id,
      name: q.name,
      chapters,
      current,
      done: chapters.reduce((sum, c) => sum + c.done, 0),
      total: chapters.reduce((sum, c) => sum + c.total, 0),
      complete: questCompleteDay.has(q.id),
      completedDay: questCompleteDay.get(q.id) ?? null,
      reward: makeItem(`mq:${q.id}`, questRarity(q.data)),
      completeXp: multi ? MAIN_QUEST_COMPLETE_XP : SHORT_QUEST_COMPLETE_XP,
      title: multi ? questTitle(q.name, q.data) : null,
    };
  });

  // ---------- Shadow Army: mastered quests, extracted ----------
  const extractedOn = new Map<string, DayKey>();
  for (const d of decisions) if (d.kind === 'mastery' && d.accepted && !extractedOn.has(d.habitId)) extractedOn.set(d.habitId, d.day);
  const shadows = habits
    .filter((h) => h.mastered && !h.archived)
    .map((h) => {
      const s = Math.round((strength.get(h.id) ?? 0) * 10) / 10;
      return {
        habitId: h.id,
        name: SHADOW_NAMES[hash(h.id) % SHADOW_NAMES.length],
        habitName: h.name,
        stat: h.stat,
        rank: SHADOW_RANKS.find((r) => s >= r.min)?.rank ?? SHADOW_RANKS[SHADOW_RANKS.length - 1].rank,
        strength: s,
        extractedDay: extractedOn.get(h.id) ?? null,
        faded: s < WEAKENED_BELOW,
      };
    });

  // ---------- Hunter's Record: real-world totals and personal bests ----------
  const from30 = addDays(today, -29);
  const from60 = addDays(today, -59);
  const recordHabits: HabitRecord[] = [];
  const milestones: RecordMilestone[] = [];
  for (const h of habits) {
    const byDay = new Map<DayKey, number>();
    for (const l of logs) {
      if (l.habitId === h.id && l.day <= today && l.day >= h.startDay) byDay.set(l.day, (byDay.get(l.day) ?? 0) + l.amount);
    }
    const days = [...byDay.entries()].map(([d, v]) => [d, Math.max(0, v)] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let total = 0;
    let next = 0;
    for (const [d, v] of days) {
      total += v;
      while (next < RECORD_MILESTONES.length && total >= RECORD_MILESTONES[next].times * h.target) {
        const m = RECORD_MILESTONES[next];
        milestones.push({ habitId: h.id, times: m.times, title: `${h.name} ${m.tier}`, amount: m.times * h.target, reachedDay: d });
        next += 1;
      }
    }
    const sumIn = (lo: DayKey, hi: DayKey) => days.filter(([d]) => d >= lo && d <= hi).reduce((sum, [, v]) => sum + v, 0);
    recordHabits.push({
      habitId: h.id,
      name: h.name,
      unit: h.unit,
      target: h.target,
      total,
      daysDone: days.filter(([, v]) => v >= h.target).length,
      bestDay: days.reduce((m, [, v]) => Math.max(m, v), 0),
      last30: sumIn(from30, today),
      prev30: sumIn(from60, addDays(from30, -1)),
    });
  }
  const keptIn = (lo: DayKey, hi: DayKey) =>
    history.filter((d) => d.day >= lo && d.day <= hi && KEPT_KINDS.includes(d.kind)).length + (keptToday && today >= lo && today <= hi ? 1 : 0);
  const record = {
    habits: recordHabits,
    milestones,
    longestStreak: progress.maxStreak,
    bestWeek: Math.max(0, ...keptByWeek.values()),
    keptLast30: keptIn(from30, today),
    keptPrev30: keptIn(from60, addDays(from30, -1)),
    totalKept: keptIn('0000-01-01', today),
  };

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
    achievements,
    allStatsBonus,
    inventory,
    equipped,
    activeTitle,
    modifiers: todayMods,
    hiddenStats: {
      indomitable: progress.comebacks * 2 + progress.survivals * 3,
      composure: progress.minClears + restDays,
      insight: checkins.length + progress.masteries * 5,
      dignity: progress.gatesCleared * 2 + highGradeClears,
    },
    jobChange,
    mainQuests: mainQuestStates,
    shadows,
    record,
    forgedCount: progress.forged,
    economyV2: v2(today),
    restCost: Math.max(0, SKILLS.rest_day.mpCost - todayMods.restDiscount),
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

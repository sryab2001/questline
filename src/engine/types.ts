import type { DayKey } from './day';
import type { Drop } from './drops';
import type { Item, Modifiers, Slot } from './items';
import type { Grade, Rank, SkillId, Stat } from './rules';

/** `daily`, or a comma-separated list of weekdays (0 = Sunday), e.g. "1,3,5". */
export type Schedule = string;

export interface Habit {
  id: string;
  name: string;
  stat: Stat;
  target: number;
  unit: string;
  schedule: Schedule;
  grade: Grade;
  /** First day this habit counts. */
  startDay: DayKey;
  archived: boolean;
  /** "Bad day" version; reaching it is a Minimum Clear. */
  minTarget?: number | null;
  /** Became a Passive Skill. */
  mastered?: boolean;
  // Display-only metadata (ignored by the engine).
  cue?: string;
  place?: string;
  bundle?: string;
  masteryName?: string;
  masteryTitle?: string;
}

export interface LogEntry {
  habitId: string;
  day: DayKey;
  amount: number;
}

/** What happened to one goal on a closed day. Frozen once the day closes. */
export interface GoalOutcome {
  habitId: string;
  name: string;
  stat: Stat;
  grade: Grade;
  done: boolean;
  /** Reached the minimum but not the full target. */
  min?: boolean;
  /** Was a (non-weakened) Passive Skill that day. */
  mastered?: boolean;
}

export type SurvivalStatus = 'active' | 'cleared' | 'failed';

export interface DayOutcome {
  day: DayKey;
  goals: GoalOutcome[];
  /** Penalty quest taken for this failed day, if any. */
  survival?: SurvivalStatus | null;
}

/** What a random box turned out to contain; rolled once at purchase. */
export type BoxResult =
  | { type: 'treat'; name: string }
  | { type: 'shield' }
  | { type: 'mp'; amount: number }
  | { type: 'gold'; amount: number };

export type PurchaseKind = 'treat' | 'shield' | 'blessed_box' | 'cursed_box';

export interface Purchase {
  day: DayKey;
  kind: PurchaseKind;
  cost: number;
  result?: BoxResult | null;
}

export interface SkillUse {
  skill: SkillId;
  day: DayKey;
}

export interface Allocation {
  stat: Stat;
  points: number;
}

export interface Checkin {
  habitId: string;
  day: DayKey;
  /** Mean of the four SRBAI answers, 1–7. */
  avg: number;
}

export type OfferKind = 'up' | 'down' | 'mastery';

/** Player's answer to an offer, so it isn't repeated too soon. */
export interface OfferDecision {
  habitId: string;
  kind: OfferKind;
  day: DayKey;
  accepted?: boolean;
}

/** A long-term goal chain. Steps are done in order; each records the day it was done. */
export interface ClassQuestInput {
  id: string;
  name: string;
  steps: { title: string; grade: Grade; doneDay: DayKey | null }[];
}

export interface EngineInput {
  habits: Habit[];
  logs: LogEntry[];
  /** Outcomes of days that have already closed, in any order. */
  closedDays: DayOutcome[];
  today: DayKey;
  purchases?: Purchase[];
  skillUses?: SkillUse[];
  allocations?: Allocation[];
  checkins?: Checkin[];
  decisions?: OfferDecision[];
  /** Surprise drops and Critical Clears (default on). */
  surprises?: boolean;
  /** Urgent Quests the player cleared. */
  urgentCleared?: { day: DayKey; challengeId: string }[];
  /** Equipment changes in creation order ("" itemId = unequip). Effects apply from that day on. */
  equips?: { slot: Slot; itemId: string; day: DayKey }[];
  /** Title changes in creation order ("" = none). */
  titleChanges?: { title: string; day: DayKey }[];
  /** Job changes in creation order. */
  jobChanges?: { jobId: string; day: DayKey }[];
  /** Days the Job Change trial was (re)started. */
  jobTrials?: { day: DayKey }[];
  classQuests?: ClassQuestInput[];
}

export interface GoalProgress {
  habitId: string;
  name: string;
  stat: Stat;
  unit: string;
  progress: number;
  target: number;
  minTarget: number | null;
  done: boolean;
  /** Reached the minimum but not the target. */
  min: boolean;
  mastered: boolean;
  weakened: boolean;
}

/**
 * cleared: every goal fully done · min: every goal at least at its minimum ·
 * slip: first miss · failure: second miss in a row · shielded: a failure a Shield absorbed ·
 * rested: Rest Day · empty: nothing scheduled
 */
export type DayKind = 'cleared' | 'min' | 'slip' | 'failure' | 'shielded' | 'rested' | 'empty';

export interface StrengthChange {
  habitId: string;
  name: string;
  before: number;
  after: number;
}

export interface DaySummary {
  day: DayKey;
  kind: DayKind;
  cleared: number;
  total: number;
  /** Missed at least one goal (even if shielded or rested). */
  failed: boolean;
  shielded: boolean;
  rested: boolean;
  /** Kept the day right after a missed one. */
  comeback: boolean;
  survival: SurvivalStatus | null;
  xpGained: number;
  /** EXP actually lost to the penalty (after the level floor). */
  xpLost: number;
  goldGained: number;
  hpChange: number;
  missed: string[];
  done: string[];
  drops: Drop[];
  criticals: string[];
  strength: StrengthChange[];
  /** An Urgent Quest was cleared this day. */
  urgent: boolean;
  /** This day completed the week's Gate. */
  gateCleared: boolean;
}

export interface AchievementState {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  unlockedDay: DayKey | null;
  allStats: number;
  itemRarity: string | null;
}

export interface OwnedItem extends Item {
  obtainedDay: DayKey;
}

export interface HiddenStats {
  indomitable: number;
  composure: number;
  insight: number;
  dignity: number;
}

export interface JobChangeState {
  unlocked: boolean;
  unlockLevel: number;
  job: { id: string; name: string; stat: Stat; description: string } | null;
  trialStarted: DayKey | null;
  trialProgress: number;
  trialNeeded: number;
  trialCleared: boolean;
  options: { id: string; name: string; stat: Stat; description: string }[];
}

export interface ClassQuestState {
  id: string;
  name: string;
  done: number;
  total: number;
  complete: boolean;
  completedDay: DayKey | null;
  /** What finishing it awards (the same item every time). */
  reward: Item;
  xpPerStep: number[];
}

export interface HabitStat {
  /** 0–100 habit strength. */
  strength: number;
  completions: number;
  mastered: boolean;
  weakened: boolean;
  /** Mean of the latest automaticity check-in, if any. */
  lastCheckin: number | null;
  checkinDue: boolean;
  masteryReady: boolean;
}

export interface QuestOffer {
  habitId: string;
  name: string;
  kind: 'up' | 'down';
  fromTarget: number;
  toTarget: number;
  /** Suggested minimum for a downgrade when the quest has none. */
  suggestMin: number | null;
  unit: string;
}

export interface GateState {
  /** Monday of this week. */
  weekStart: DayKey;
  /** Kept days so far this week (today counts once kept). */
  kept: number;
  required: number;
  complete: boolean;
  /** Per weekday Mon..Sun: kept, missed, open (today/future), or none (nothing scheduled). */
  days: ('kept' | 'missed' | 'open' | 'none')[];
}

export interface PlayerState {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  rank: Rank;
  stats: Record<Stat, number>;
  /** Part of each stat that comes from Passive Skills. */
  passiveBonus: Record<Stat, number>;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gold: number;
  abilityPoints: { earned: number; spent: number; available: number };
  /** Streak Shields owned and not yet used. */
  shields: number;
  /** Consecutive kept days. Slips, rest and shielded days don't break it; failures do. */
  streak: number;
  /** The last missed day was a Slip and today isn't kept yet: miss today and it's a Failure. */
  streakAtRisk: boolean;
  nextMilestone: number | null;
  /** One entry per closed day, oldest first. */
  history: DaySummary[];
  skills: Record<SkillId, { unlocked: boolean; activeToday: boolean; canUse: boolean }>;
  habits: Record<string, HabitStat>;
  offers: QuestOffer[];
  gate: GateState;
  /** Titles earned from finished Seasons (calendar months), oldest first. */
  seasonTitles: { month: string; title: string; keptDays: number }[];
  achievements: AchievementState[];
  /** Permanent bonus to every stat from first-clear achievements. */
  allStatsBonus: number;
  inventory: OwnedItem[];
  equipped: Record<Slot, OwnedItem | null>;
  /** The equipped title, if it's an unlocked achievement title (cosmetic titles have no effect). */
  activeTitle: string | null;
  /** Effects in force today from items, title and job. */
  modifiers: Modifiers;
  hiddenStats: HiddenStats;
  jobChange: JobChangeState;
  classQuests: ClassQuestState[];
  today: {
    goals: GoalProgress[];
    cleared: number;
    total: number;
    allCleared: boolean;
    /** Every goal at least at its minimum. */
    kept: boolean;
    rested: boolean;
    comeback: boolean;
    drops: Drop[];
    criticals: string[];
    urgentCleared: boolean;
  };
}

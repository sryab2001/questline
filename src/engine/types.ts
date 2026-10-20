import type { DayKey } from './day';
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

export interface EngineInput {
  habits: Habit[];
  logs: LogEntry[];
  /** Outcomes of days that have already closed, in any order. */
  closedDays: DayOutcome[];
  today: DayKey;
  purchases?: Purchase[];
  skillUses?: SkillUse[];
  allocations?: Allocation[];
}

export interface GoalProgress {
  habitId: string;
  name: string;
  stat: Stat;
  unit: string;
  progress: number;
  target: number;
  done: boolean;
}

export interface DaySummary {
  day: DayKey;
  cleared: number;
  total: number;
  /** Had scheduled goals and missed at least one (even if shielded or rested). */
  failed: boolean;
  /** A Streak Shield absorbed the failure. */
  shielded: boolean;
  /** Rest Day was used. */
  rested: boolean;
  survival: SurvivalStatus | null;
  xpGained: number;
  /** EXP actually lost to the penalty (after the level floor). */
  xpLost: number;
  goldGained: number;
  hpChange: number;
  missed: string[];
  done: string[];
}

export interface PlayerState {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  rank: Rank;
  stats: Record<Stat, number>;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gold: number;
  abilityPoints: { earned: number; spent: number; available: number };
  /** Streak Shields owned and not yet used. */
  shields: number;
  /** Consecutive fully-cleared days, counting today only once it is cleared. Rest and shielded days don't break it. */
  streak: number;
  /** One entry per closed day, oldest first. */
  history: DaySummary[];
  skills: Record<SkillId, { unlocked: boolean; activeToday: boolean; canUse: boolean }>;
  today: {
    goals: GoalProgress[];
    cleared: number;
    total: number;
    allCleared: boolean;
    rested: boolean;
  };
}

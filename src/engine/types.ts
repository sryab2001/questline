import type { DayKey } from './day';
import type { Grade, Rank, Stat } from './rules';

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

export interface DayOutcome {
  day: DayKey;
  goals: GoalOutcome[];
}

export interface EngineInput {
  habits: Habit[];
  logs: LogEntry[];
  /** Outcomes of days that have already closed, in any order. */
  closedDays: DayOutcome[];
  today: DayKey;
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
  /** Had scheduled goals and missed at least one. */
  failed: boolean;
  xpGained: number;
  /** EXP actually lost to the penalty (after the level floor). */
  xpLost: number;
  hpChange: number;
  missed: string[];
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
  /** Consecutive fully-cleared days, counting today only once it is cleared. */
  streak: number;
  /** One entry per closed day, oldest first. */
  history: DaySummary[];
  today: {
    goals: GoalProgress[];
    cleared: number;
    total: number;
    allCleared: boolean;
  };
}

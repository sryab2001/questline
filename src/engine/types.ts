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

export interface EngineInput {
  habits: Habit[];
  logs: LogEntry[];
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

export interface PlayerState {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  rank: Rank;
  stats: Record<Stat, number>;
  /** Consecutive fully-cleared days, counting today only once it is cleared. */
  streak: number;
  today: {
    goals: GoalProgress[];
    cleared: number;
    total: number;
    allCleared: boolean;
  };
}

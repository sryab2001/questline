import { SURVIVAL_HOURS } from './rules';
import type { SurvivalStatus } from './types';

/** Stored on the failed day's result while the penalty quest runs. */
export interface SurvivalQuest {
  status: SurvivalStatus;
  startedAt: number;
  deadline: number;
  /** Today's cleared-goal count needed to survive. */
  required: number;
  /** The result screen has been shown (unset while active). */
  seen?: boolean;
}

/**
 * Starts "Survival": clear as many of today's goals as you missed (at least one),
 * within 4 hours or before the daily reset, whichever comes first.
 * Returns null when today has nothing left to clear.
 */
export function startSurvival(
  missedCount: number,
  todayCleared: number,
  todayTotal: number,
  now: number,
  nextReset: number,
): SurvivalQuest | null {
  if (todayTotal - todayCleared <= 0) return null;
  return {
    status: 'active',
    startedAt: now,
    deadline: Math.min(now + SURVIVAL_HOURS * 3_600_000, nextReset),
    required: Math.min(todayTotal, todayCleared + Math.max(1, missedCount)),
  };
}

/** New status for an active quest, or null if nothing changed. */
export function checkSurvival(q: SurvivalQuest, todayCleared: number, now: number): SurvivalStatus | null {
  if (q.status !== 'active') return null;
  if (todayCleared >= q.required) return 'cleared';
  if (now >= q.deadline) return 'failed';
  return null;
}

export function parseSurvival(json: string | null | undefined): SurvivalQuest | null {
  if (!json) return null;
  try {
    const q = JSON.parse(json) as SurvivalQuest;
    return q && typeof q.status === 'string' ? q : null;
  } catch {
    return null;
  }
}

/** Next daily reset after `now`, in the phone's local time. */
export function nextResetAt(now: Date, resetHour: number): Date {
  const reset = new Date(now);
  reset.setHours(resetHour, 0, 0, 0);
  if (reset <= now) reset.setDate(reset.getDate() + 1);
  return reset;
}

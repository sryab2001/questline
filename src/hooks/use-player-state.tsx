import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, type ReactNode, use, useEffect, useMemo } from 'react';

import { closePendingDays, dayResultsQuery, habitsQuery, logsQuery, settingsQuery, toEngineHabit } from '@/db/actions';
import { computeState, dayKey, type DayOutcome, type DaySummary, type Habit, type PlayerState } from '@/engine';
import { syncReminders } from '@/notifications';

import { useNow } from './use-now';

export interface PlayerData {
  state: PlayerState;
  habits: Habit[];
  settings: {
    playerName: string;
    timeZone: string;
    resetHour: number;
    morningHour: number;
    warningHour: number;
    lastSeenLevel: number;
  };
  today: string;
  now: Date;
  /** Failed days the player hasn't dismissed yet, oldest first. */
  unseenFailures: DaySummary[];
}

const PlayerContext = createContext<PlayerData | null>(null);

function useComputePlayer(): PlayerData | null {
  const { data: settingsRows } = useLiveQuery(settingsQuery());
  const { data: habitRows } = useLiveQuery(habitsQuery());
  const { data: logRows } = useLiveQuery(logsQuery());
  const { data: resultRows } = useLiveQuery(dayResultsQuery());
  const now = useNow();

  return useMemo(() => {
    const s = settingsRows[0];
    if (!s) return null;
    const habits = habitRows.map(toEngineHabit);
    const today = dayKey(now, s.timeZone, s.resetHour);
    const closedDays: DayOutcome[] = resultRows.map((r) => ({ day: r.day, goals: JSON.parse(r.outcomesJson) }));
    const state = computeState({
      habits,
      logs: logRows.map((l) => ({ habitId: l.habitId, day: l.day, amount: l.amount })),
      closedDays,
      today,
    });
    const unseen = new Set(resultRows.filter((r) => !r.acknowledged).map((r) => r.day));
    return {
      state,
      habits,
      settings: {
        playerName: s.playerName,
        timeZone: s.timeZone,
        resetHour: s.resetHour,
        morningHour: s.morningHour,
        warningHour: s.warningHour,
        lastSeenLevel: s.lastSeenLevel,
      },
      today,
      now,
      unseenFailures: state.history.filter((d) => d.failed && unseen.has(d.day)),
    };
  }, [settingsRows, habitRows, logRows, resultRows, now]);
}

/** Computes player state once for the whole app and runs the game's side effects. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useComputePlayer();

  // Close finished days whenever the day changes or the habit list changes.
  const today = player?.today;
  const habitCount = player?.habits.length ?? 0;
  useEffect(() => {
    if (today) closePendingDays();
  }, [today, habitCount]);

  // Keep scheduled reminders in step with today's progress and settings.
  const plan = player && {
    morningHour: player.settings.morningHour,
    warningHour: player.settings.warningHour,
    todayTotal: player.state.today.total,
    todayCleared: player.state.today.cleared,
    hasHabits: player.habits.length > 0,
  };
  const planKey = plan ? `${today}|${JSON.stringify(plan)}` : null;
  useEffect(() => {
    if (!plan) return;
    const t = setTimeout(() => syncReminders(plan).catch(() => {}), 800);
    return () => clearTimeout(t);
    // planKey captures every field of plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  return <PlayerContext value={player}>{children}</PlayerContext>;
}

export function usePlayerState(): PlayerData | null {
  return use(PlayerContext);
}

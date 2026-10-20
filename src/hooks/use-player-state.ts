import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useMemo, useState } from 'react';

import { habitsQuery, logsQuery, settingsQuery } from '@/db/actions';
import { computeState, dayKey, type Habit, type PlayerState } from '@/engine';

/** Re-renders once a minute so the day rolls over while the app is open. */
function useMinuteTick() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function usePlayerState(): { state: PlayerState; playerName: string; habits: Habit[] } | null {
  const { data: settingsRows } = useLiveQuery(settingsQuery());
  const { data: habitRows } = useLiveQuery(habitsQuery());
  const { data: logRows } = useLiveQuery(logsQuery());
  const now = useMinuteTick();

  return useMemo(() => {
    const s = settingsRows[0];
    if (!s) return null;
    const habits: Habit[] = habitRows.map((h) => ({
      id: h.id,
      name: h.name,
      stat: h.stat,
      target: h.target,
      unit: h.unit,
      schedule: h.schedule,
      grade: h.grade,
      startDay: h.startDay,
      archived: h.archived,
    }));
    const today = dayKey(now, s.timeZone, s.resetHour);
    const state = computeState({
      habits,
      logs: logRows.map((l) => ({ habitId: l.habitId, day: l.day, amount: l.amount })),
      today,
    });
    return { state, playerName: s.playerName, habits };
  }, [settingsRows, habitRows, logRows, now]);
}

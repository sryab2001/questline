import { useEffect, useRef, useState } from 'react';

import { type Drop, GOAL_XP, GOLD_PER_GOAL, type Grade, MASTERED_XP_FACTOR, type PlayerState, URGENT_REWARD } from '@/engine';
import { playSound } from '@/sound';

export interface ClearEvent {
  key: number;
  name: string;
  xp: number;
  gold: number;
  critical: boolean;
  /** Surprise drops revealed by this clear (the quest's own, plus the daily-clear roll). */
  drops: Drop[];
  /** This clear completed the whole Daily Quest. */
  questComplete: boolean;
  comeback: boolean;
}

/**
 * Watches today's goals and reports the moment one becomes done (with its rewards),
 * playing the System chime. The first render only records the baseline.
 */
export function useClearEvents(today: PlayerState['today'] | undefined, grades: Map<string, Grade>, dayKey: string): ClearEvent | null {
  const prev = useRef<{ day: string; done: Set<string>; urgent: boolean } | null>(null);
  const [event, setEvent] = useState<ClearEvent | null>(null);

  useEffect(() => {
    if (!today) return;
    const done = new Set(today.goals.filter((g) => g.done).map((g) => g.habitId));
    const before = prev.current;
    prev.current = { day: dayKey, done, urgent: today.urgentCleared };
    if (!before || before.day !== dayKey) return;

    if (today.urgentCleared && !before.urgent) {
      const drops = today.drops.filter((d) => d.source === 'urgent');
      playSound('quest');
      if (drops.length) setTimeout(() => playSound('purchase'), 450);
      setEvent({ key: Date.now(), name: 'Urgent Quest', xp: URGENT_REWARD.xp, gold: URGENT_REWARD.gold, critical: false, drops, questComplete: false, comeback: false });
      return;
    }

    const newly = today.goals.filter((g) => g.done && !before.done.has(g.habitId));
    if (newly.length === 0) return;

    const g = newly[newly.length - 1];
    const questComplete = today.allCleared;
    const critical = today.criticals.includes(g.name);
    const drops = today.drops.filter((d) => d.source === g.habitId || (questComplete && d.source === 'clear'));
    const xp = Math.round(GOAL_XP[grades.get(g.habitId) ?? 'E'] * (g.mastered && !g.weakened ? MASTERED_XP_FACTOR : 1) * (critical ? 2 : 1));

    playSound(questComplete ? 'quest' : 'clear');
    if (drops.length) setTimeout(() => playSound('purchase'), 450);
    setEvent({ key: Date.now(), name: g.name, xp, gold: GOLD_PER_GOAL, critical, drops, questComplete, comeback: today.comeback });
  }, [today, grades, dayKey]);

  return event;
}

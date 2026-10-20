import { useEffect, useRef, useState } from 'react';

import { GOAL_XP, GOLD_PER_GOAL, type GoalProgress, type Grade } from '@/engine';
import { playSound } from '@/sound';

export interface ClearEvent {
  key: number;
  name: string;
  xp: number;
  gold: number;
  /** This clear completed the whole Daily Quest. */
  questComplete: boolean;
}

/**
 * Watches today's goals and reports the moment one becomes done (with its rewards),
 * playing the System chime. The first render only records the baseline.
 */
export function useClearEvents(goals: GoalProgress[], grades: Map<string, Grade>, today: string): ClearEvent | null {
  const prev = useRef<{ today: string; done: Set<string> } | null>(null);
  const [event, setEvent] = useState<ClearEvent | null>(null);

  useEffect(() => {
    const done = new Set(goals.filter((g) => g.done).map((g) => g.habitId));
    const before = prev.current;
    prev.current = { today, done };
    if (!before || before.today !== today) return;

    const newly = goals.filter((g) => g.done && !before.done.has(g.habitId));
    if (newly.length === 0) return;

    const questComplete = goals.length > 0 && done.size === goals.length;
    playSound(questComplete ? 'quest' : 'clear');
    const g = newly[newly.length - 1];
    setEvent({ key: Date.now(), name: g.name, xp: GOAL_XP[grades.get(g.habitId) ?? 'E'], gold: GOLD_PER_GOAL, questComplete });
  }, [goals, grades, today]);

  return event;
}

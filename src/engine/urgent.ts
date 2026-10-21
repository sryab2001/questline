import type { DayKey } from './day';
import { seededRng } from './random';
import { URGENT_CHANCE, URGENT_POOL, URGENT_WINDOW_MINUTES, type UrgentFrequency } from './rules';

export interface UrgentQuest {
  day: DayKey;
  challengeId: string;
  text: string;
  stat: (typeof URGENT_POOL)[number]['stat'];
  /** Minutes after local midnight of `day` when it appears. */
  startMinute: number;
  endMinute: number;
}

/**
 * Whether `day` has an Urgent Quest, when, and which one. Fully determined by the
 * date, so the scheduled notification and the app always agree, and nothing can be
 * re-rolled. The appearance chance depends on the frequency; the challenge and time
 * don't, so changing frequency never reshuffles quests that already appeared.
 */
export function urgentQuestFor(
  day: DayKey,
  frequency: UrgentFrequency,
  morningHour: number,
  warningHour: number,
): UrgentQuest | null {
  const chance = URGENT_CHANCE[frequency] ?? 0;
  if (chance <= 0) return null;
  // Appear between an hour after the morning notice and an hour before the warning.
  const earliest = (morningHour + 1) * 60;
  const latest = (warningHour - 1) * 60 - URGENT_WINDOW_MINUTES;
  if (latest <= earliest) return null;

  const rng = seededRng(`urgent:${day}`);
  const roll = rng();
  const timeRoll = rng();
  const pick = URGENT_POOL[Math.floor(rng() * URGENT_POOL.length)];
  if (roll >= chance) return null;

  const startMinute = earliest + Math.floor(timeRoll * (latest - earliest));
  return {
    day,
    challengeId: pick.id,
    text: pick.text,
    stat: pick.stat,
    startMinute,
    endMinute: startMinute + URGENT_WINDOW_MINUTES,
  };
}

/** The quest's window as real Dates on the phone's local clock. Gear can keep it open longer. */
export function urgentWindow(q: UrgentQuest, extraMinutes = 0): { start: Date; end: Date } {
  const [y, m, d] = q.day.split('-').map(Number);
  const at = (min: number) => new Date(y, m - 1, d, Math.floor(min / 60), min % 60, 0, 0);
  return { start: at(q.startMinute), end: at(q.endMinute + extraMinutes) };
}

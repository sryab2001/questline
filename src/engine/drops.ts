import type { DayKey } from './day';
import { seededRng, weightedPick } from './random';
import { CLEAR_DROP_CHANCE, CRITICAL_CHANCE, DROP_VALUES, GOAL_DROP_CHANCE, type Rarity, RARITY_WEIGHTS } from './rules';

export type DropType = 'gold' | 'xp' | 'mp' | 'shield';

export interface Drop {
  /** Quest that dropped it, or "clear" for the daily-clear roll, or "gate" for a Gate reward. */
  source: string;
  rarity: Rarity;
  type: DropType;
  amount: number;
}

const TYPE_WEIGHTS: Record<Rarity, Record<DropType, number>> = {
  Normal: { gold: 50, xp: 35, mp: 15, shield: 0 },
  Rare: { gold: 50, xp: 35, mp: 15, shield: 0 },
  Epic: { gold: 40, xp: 35, mp: 10, shield: 15 },
  Unique: { gold: 30, xp: 30, mp: 0, shield: 40 },
  Legendary: { gold: 30, xp: 30, mp: 0, shield: 40 },
};

function roll(source: string, seed: string, chance: number): Drop | null {
  const rng = seededRng(seed);
  if (rng() >= chance) return null;
  const rarity = weightedPick(RARITY_WEIGHTS, rng());
  const type = weightedPick(TYPE_WEIGHTS[rarity], rng());
  const amount = type === 'shield' ? 1 : DROP_VALUES[rarity][type];
  return { source, rarity, type, amount };
}

/** Hidden drop chance for clearing one quest on one day. */
export function goalDrop(habitId: string, day: DayKey): Drop | null {
  return roll(habitId, `drop:${habitId}:${day}`, GOAL_DROP_CHANCE);
}

/** Extra roll for clearing the whole Daily Quest. */
export function clearDrop(day: DayKey): Drop | null {
  return roll('clear', `clear:${day}`, CLEAR_DROP_CHANCE);
}

/** Critical Clear: double EXP for this quest today. */
export function isCritical(habitId: string, day: DayKey): boolean {
  return seededRng(`crit:${habitId}:${day}`)() < CRITICAL_CHANCE;
}

export function describeDrop(d: Drop): string {
  switch (d.type) {
    case 'gold':
      return `Gold Pouch (+${d.amount} G)`;
    case 'xp':
      return `EXP Scroll (+${d.amount} EXP)`;
    case 'mp':
      return `MP Potion (+${d.amount} MP)`;
    case 'shield':
      return 'Streak Shield';
  }
}

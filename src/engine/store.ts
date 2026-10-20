import { MP_POTION_AMOUNT } from './rules';
import type { BoxResult } from './types';

/** Random in [0, 1). Injected so rolls are testable. */
export type Rng = () => number;

/** Blessed box: one of your own rewards, chosen at random. */
export function rollBlessedBox(treatNames: string[], rng: Rng = Math.random): BoxResult | null {
  if (treatNames.length === 0) return null;
  return { type: 'treat', name: treatNames[Math.floor(rng() * treatNames.length)] };
}

/** Cursed box: something you need. 20% Streak Shield, 40% MP potion, 40% gold pouch (100–500 G). */
export function rollCursedBox(rng: Rng = Math.random): BoxResult {
  const r = rng();
  if (r < 0.2) return { type: 'shield' };
  if (r < 0.6) return { type: 'mp', amount: MP_POTION_AMOUNT };
  return { type: 'gold', amount: 100 + 50 * Math.floor(rng() * 9) };
}

export function describeBoxResult(r: BoxResult): string {
  switch (r.type) {
    case 'treat':
      return r.name;
    case 'shield':
      return 'Streak Shield';
    case 'mp':
      return `MP Potion (+${r.amount} MP)`;
    case 'gold':
      return `Gold Pouch (+${r.amount} G)`;
  }
}

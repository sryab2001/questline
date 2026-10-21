// Rated equipment (Overgeared-style). Items are generated deterministically from a
// source key, so the same Gate, achievement or Class Quest always yields the same item.
import { seededRng, weightedPick } from './random';
import { type Rarity, RARITIES, type Stat, STATS } from './rules';

export const SLOTS = ['weapon', 'armor', 'accessory'] as const;
export type Slot = (typeof SLOTS)[number];

/** Effects are deliberately small: rewards support habits, they don't replace them. */
export type Effect =
  | { kind: 'xp_stat_pct'; stat: Stat; value: number }
  | { kind: 'xp_pct'; value: number }
  | { kind: 'gold_pct'; value: number }
  | { kind: 'hp_per_kept'; value: number }
  | { kind: 'mp_per_goal'; value: number };

export interface Item {
  /** Stable id = its source, e.g. "gate:2026-10-12", "ach:streak_7", "class:<uuid>". */
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  effects: Effect[];
}

const PREFIX: Record<Rarity, string> = {
  Normal: 'Worn',
  Rare: 'Tempered',
  Epic: 'Radiant',
  Unique: "Hero's",
  Legendary: 'Sunlit',
};

const WEAPONS: Record<Stat, string> = {
  STR: 'Greatsword',
  AGI: 'Wind Daggers',
  STA: 'Oathbound Mace',
  INT: 'Grimoire',
  SENSE: "Seer's Staff",
};
const ARMORS = ['Chainmail', "Knight's Plate", 'Ranger Coat', 'Warden Mail', 'Pilgrim Robe'];
const ACCESSORIES = ['Ring of Discipline', 'Amulet of Focus', 'Bracelet of Resolve', 'Signet of Dawn', 'Charm of Patience'];

const R = (r: Rarity) => RARITIES.indexOf(r);
const XP_STAT = [4, 6, 9, 13, 18];
const HP = [2, 3, 4, 6, 8];
const GOLD = [0, 0, 3, 5, 8];
const XP_ALL = [2, 3, 5, 7, 10];
const MP = [1, 1, 2, 2, 3];

/** Builds the item for a source key. Slot and rarity can be fixed by the source. */
export function makeItem(id: string, rarity: Rarity, slot?: Slot): Item {
  const rng = seededRng(`item:${id}`);
  const s: Slot = slot ?? SLOTS[Math.floor(rng() * SLOTS.length)];
  const stat = STATS[Math.floor(rng() * STATS.length)];
  const pick = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
  const i = R(rarity);

  if (s === 'weapon') {
    return { id, slot: s, rarity, name: `${PREFIX[rarity]} ${WEAPONS[stat]}`, effects: [{ kind: 'xp_stat_pct', stat, value: XP_STAT[i] }] };
  }
  if (s === 'armor') {
    const effects: Effect[] = [{ kind: 'hp_per_kept', value: HP[i] }];
    if (GOLD[i]) effects.push({ kind: 'gold_pct', value: GOLD[i] });
    return { id, slot: s, rarity, name: `${PREFIX[rarity]} ${pick(ARMORS)}`, effects };
  }
  const focus = rng() < 0.5;
  return {
    id,
    slot: s,
    rarity,
    name: `${PREFIX[rarity]} ${pick(ACCESSORIES)}`,
    effects: [focus ? { kind: 'xp_pct', value: XP_ALL[i] } : { kind: 'mp_per_goal', value: MP[i] }],
  };
}

/** Weekly Gate reward rarity: mostly Normal/Rare, rarely better. */
const GATE_RARITY: Record<Rarity, number> = { Normal: 40, Rare: 35, Epic: 18, Unique: 6, Legendary: 1 };
export function gateItem(weekStart: string): Item {
  return makeItem(`gate:${weekStart}`, weightedPick(GATE_RARITY, seededRng(`gaterarity:${weekStart}`)()));
}

/** Class Quest reward rarity grows with the length of the chain. */
export function classQuestRarity(steps: number): Rarity {
  if (steps >= 8) return 'Legendary';
  if (steps >= 6) return 'Unique';
  if (steps >= 4) return 'Epic';
  if (steps >= 3) return 'Rare';
  return 'Normal';
}

export function describeEffect(e: Effect): string {
  switch (e.kind) {
    case 'xp_stat_pct':
      return `+${e.value}% EXP from ${e.stat} quests`;
    case 'xp_pct':
      return `+${e.value}% EXP`;
    case 'gold_pct':
      return `+${e.value}% gold`;
    case 'hp_per_kept':
      return `+${e.value} HP per kept day`;
    case 'mp_per_goal':
      return `+${e.value} MP per cleared goal`;
  }
}

/** Combined modifiers from a set of effects. */
export interface Modifiers {
  xpPct: number;
  xpStatPct: Record<Stat, number>;
  goldPct: number;
  hpPerKept: number;
  mpPerGoal: number;
}

export function emptyModifiers(): Modifiers {
  return { xpPct: 0, xpStatPct: { STR: 0, AGI: 0, STA: 0, INT: 0, SENSE: 0 }, goldPct: 0, hpPerKept: 0, mpPerGoal: 0 };
}

export function addEffects(m: Modifiers, effects: Effect[]): Modifiers {
  for (const e of effects) {
    if (e.kind === 'xp_stat_pct') m.xpStatPct[e.stat] += e.value;
    else if (e.kind === 'xp_pct') m.xpPct += e.value;
    else if (e.kind === 'gold_pct') m.goldPct += e.value;
    else if (e.kind === 'hp_per_kept') m.hpPerKept += e.value;
    else if (e.kind === 'mp_per_goal') m.mpPerGoal += e.value;
  }
  return m;
}

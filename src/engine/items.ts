// Rated equipment (Overgeared-style). Items are generated deterministically from a
// source key, so the same Gate, achievement or Main Quest always yields the same item.
// Effects mostly change how the game treats you (forgiven slips, better Minimum
// Clears, cheaper Rest Days) rather than just inflating numbers.
import { hash, seededRng, weightedPick } from './random';
import { MIN_CLEAR_REWARD, type Rarity, RARITIES, type Stat, STATS } from './rules';

export const SLOTS = ['weapon', 'armor', 'accessory'] as const;
export type Slot = (typeof SLOTS)[number];

/** Effects are deliberately small: rewards support habits, they don't replace them. */
export type Effect =
  | { kind: 'xp_stat_pct'; stat: Stat; value: number }
  | { kind: 'xp_pct'; value: number }
  | { kind: 'gold_pct'; value: number }
  | { kind: 'hp_per_kept'; value: number }
  | { kind: 'mp_per_goal'; value: number }
  /** Extra percentage points of Critical Clear chance on one stat's quests. */
  | { kind: 'crit_stat'; stat: Stat; value: number }
  /** Minimum Clears pay this many more percentage points of the full reward. */
  | { kind: 'min_clear_pct'; value: number }
  /** Slips per week that carry no penalty and don't set up a Failure. */
  | { kind: 'grace_slip'; value: number }
  /** Rest Day costs this much less MP. */
  | { kind: 'rest_discount'; value: number }
  /** Urgent Quests stay open this many minutes longer. */
  | { kind: 'urgent_minutes'; value: number };

export interface Item {
  /** Stable id = its source, e.g. "gate:2026-10-12", "ach:streak_7", "mq:<uuid>:0", "forge:<hash>". */
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

const R = (r: Rarity) => RARITIES.indexOf(r);
// Values by rarity: Normal, Rare, Epic, Unique, Legendary.
const XP_STAT = [4, 6, 9, 13, 18];
const CRIT = [0, 0, 3, 5, 8];
const HP = [2, 3, 4, 6, 8];
const MIN_CLEAR = [0, 10, 15, 20, 25];
const REST = [10, 15, 20, 25, 30];
const URGENT = [10, 15, 20, 25, 30];
const MP = [1, 1, 2, 2, 3];
const GOLD = [0, 0, 5, 8, 10];
const XP_ALL = [0, 0, 0, 5, 8];

type AccessoryKind = 'rest' | 'urgent' | 'mp' | 'gold';
const ACCESSORY_NAMES: Record<AccessoryKind, string> = {
  rest: 'Charm of Stillness',
  urgent: 'Hourglass of Haste',
  mp: 'Ring of Discipline',
  gold: 'Signet of Fortune',
};

/** Builds the item for a source key. Slot and rarity can be fixed by the source. */
export function makeItem(id: string, rarity: Rarity, slot?: Slot): Item {
  const rng = seededRng(`item:${id}`);
  const s: Slot = slot ?? SLOTS[Math.floor(rng() * SLOTS.length)];
  const stat = STATS[Math.floor(rng() * STATS.length)];
  const pick = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
  const i = R(rarity);

  if (s === 'weapon') {
    const effects: Effect[] = [{ kind: 'xp_stat_pct', stat, value: XP_STAT[i] }];
    if (CRIT[i]) effects.push({ kind: 'crit_stat', stat, value: CRIT[i] });
    return { id, slot: s, rarity, name: `${PREFIX[rarity]} ${WEAPONS[stat]}`, effects };
  }
  if (s === 'armor') {
    const effects: Effect[] = [{ kind: 'hp_per_kept', value: HP[i] }];
    if (MIN_CLEAR[i]) effects.push({ kind: 'min_clear_pct', value: MIN_CLEAR[i] });
    const grace = i >= 3;
    if (grace) effects.push({ kind: 'grace_slip', value: 1 });
    return { id, slot: s, rarity, name: `${PREFIX[rarity]} ${grace ? 'Mantle of Second Wind' : pick(ARMORS)}`, effects };
  }
  const kinds: AccessoryKind[] = i >= 2 ? ['rest', 'urgent', 'mp', 'gold'] : ['rest', 'urgent', 'mp'];
  const kind = pick(kinds);
  const effects: Effect[] = [
    kind === 'rest'
      ? { kind: 'rest_discount', value: REST[i] }
      : kind === 'urgent'
        ? { kind: 'urgent_minutes', value: URGENT[i] }
        : kind === 'mp'
          ? { kind: 'mp_per_goal', value: MP[i] }
          : { kind: 'gold_pct', value: GOLD[i] },
  ];
  if (XP_ALL[i]) effects.push({ kind: 'xp_pct', value: XP_ALL[i] });
  return { id, slot: s, rarity, name: `${PREFIX[rarity]} ${ACCESSORY_NAMES[kind]}`, effects };
}

/** Weekly Gate reward rarity: mostly Normal/Rare, rarely better. */
const GATE_RARITY: Record<Rarity, number> = { Normal: 40, Rare: 35, Epic: 18, Unique: 6, Legendary: 1 };
export function gateItem(weekStart: string): Item {
  return makeItem(`gate:${weekStart}`, weightedPick(GATE_RARITY, seededRng(`gaterarity:${weekStart}`)()));
}

/** Reward rarity for a one-chapter quest grows with its number of quests. */
export function chainRarity(tasks: number): Rarity {
  if (tasks >= 8) return 'Legendary';
  if (tasks >= 6) return 'Unique';
  if (tasks >= 4) return 'Epic';
  if (tasks >= 3) return 'Rare';
  return 'Normal';
}

// ---------- the Forge ----------

export const FORGE_INPUTS = 3;

export function nextRarity(r: Rarity): Rarity | null {
  return RARITIES[R(r) + 1] ?? null;
}

/** The item three same-rarity items forge into. Same inputs, same result. */
export function forgeResult(inputIds: string[], rarity: Rarity): Item | null {
  const next = nextRarity(rarity);
  if (!next) return null;
  return makeItem(`forge:${hash([...inputIds].sort().join('|')).toString(36)}`, next);
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
      return `+${e.value} MP per cleared quest`;
    case 'crit_stat':
      return `+${e.value}% Critical Clear chance on ${e.stat} quests`;
    case 'min_clear_pct':
      return `Minimum Clears pay ${Math.round(MIN_CLEAR_REWARD * 100) + e.value}% instead of ${Math.round(MIN_CLEAR_REWARD * 100)}%`;
    case 'grace_slip':
      return `${e.value} slip a week forgiven`;
    case 'rest_discount':
      return `Rest Day costs ${e.value} MP less`;
    case 'urgent_minutes':
      return `Urgent Quests last ${e.value} min longer`;
  }
}

/** Combined modifiers from a set of effects. */
export interface Modifiers {
  xpPct: number;
  xpStatPct: Record<Stat, number>;
  goldPct: number;
  hpPerKept: number;
  mpPerGoal: number;
  critStatPct: Record<Stat, number>;
  minClearPct: number;
  graceSlips: number;
  restDiscount: number;
  urgentMinutes: number;
}

const perStat = () => ({ STR: 0, AGI: 0, STA: 0, INT: 0, SENSE: 0 });

export function emptyModifiers(): Modifiers {
  return {
    xpPct: 0,
    xpStatPct: perStat(),
    goldPct: 0,
    hpPerKept: 0,
    mpPerGoal: 0,
    critStatPct: perStat(),
    minClearPct: 0,
    graceSlips: 0,
    restDiscount: 0,
    urgentMinutes: 0,
  };
}

export function addEffects(m: Modifiers, effects: Effect[]): Modifiers {
  for (const e of effects) {
    if (e.kind === 'xp_stat_pct') m.xpStatPct[e.stat] += e.value;
    else if (e.kind === 'xp_pct') m.xpPct += e.value;
    else if (e.kind === 'gold_pct') m.goldPct += e.value;
    else if (e.kind === 'hp_per_kept') m.hpPerKept += e.value;
    else if (e.kind === 'mp_per_goal') m.mpPerGoal += e.value;
    else if (e.kind === 'crit_stat') m.critStatPct[e.stat] += e.value;
    else if (e.kind === 'min_clear_pct') m.minClearPct += e.value;
    else if (e.kind === 'grace_slip') m.graceSlips += e.value;
    else if (e.kind === 'rest_discount') m.restDiscount += e.value;
    else if (e.kind === 'urgent_minutes') m.urgentMinutes += e.value;
  }
  return m;
}

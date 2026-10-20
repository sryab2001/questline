// Tunable game rules. Everything here can change without migrating data,
// because player state is always recomputed from the event history.

export const STATS = ['STR', 'AGI', 'STA', 'INT', 'SENSE'] as const;
export type Stat = (typeof STATS)[number];

export const STAT_INFO: Record<Stat, { name: string; source: string }> = {
  STR: { name: 'Strength', source: 'Workouts, strength training' },
  AGI: { name: 'Agility', source: 'Running, cardio, sports' },
  STA: { name: 'Stamina', source: 'Sleep, diet, hydration' },
  INT: { name: 'Intelligence', source: 'Reading, study, courses' },
  SENSE: { name: 'Sense', source: 'Meditation, journaling' },
};

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Rank = (typeof RANKS)[number];

/** Minimum level for each rank. */
export const RANK_MIN_LEVEL: Record<Rank, number> = {
  E: 1,
  D: 20,
  C: 40,
  B: 60,
  A: 80,
  S: 100,
};

export const GRADES = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Grade = (typeof GRADES)[number];

/** EXP for completing one goal, by difficulty grade. */
export const GOAL_XP: Record<Grade, number> = {
  F: 20,
  E: 30,
  D: 40,
  C: 55,
  B: 70,
  A: 90,
  S: 120,
};

/** Bonus EXP when every scheduled goal of the day is cleared. */
export const DAILY_CLEAR_BONUS_XP = 100;

/** EXP lost for a failed Daily Quest. Never drops the player below their current level. */
export const FAILED_DAY_PENALTY_XP = 150;

/** HP (streak health) rules. */
export const MAX_HP = 100;
export const FAILED_DAY_HP_LOSS = 25;
export const CLEARED_DAY_HP_GAIN = 10;

/** Gold and ability points. */
export const GOLD_PER_GOAL = 40;
export const GOLD_DAILY_CLEAR = 150;
export const POINTS_PER_DAILY_CLEAR = 3;

/** MP powers skills; it regenerates from cleared goals. */
export const MAX_MP = 60;
export const MP_PER_GOAL = 5;

export const SKILLS = {
  rest_day: {
    name: 'Rest Day',
    description: "Today's goals carry no penalty. Your streak is kept.",
    mpCost: 50,
    unlockLevel: 3,
  },
} as const;
export type SkillId = keyof typeof SKILLS;

/** Penalty quest "Survival": clearing it halves that day's penalty. */
export const SURVIVAL_HOURS = 4;
export const SURVIVAL_PENALTY_FACTOR = 0.5;

/** System items sold in the Store. */
export const SYSTEM_ITEMS = {
  shield: {
    name: 'Streak Shield',
    description: 'Absorbs one failed day: no penalty, streak kept. Used automatically.',
    cost: 1000,
  },
  blessed_box: { name: 'Blessed Random Box', description: 'Contains a reward you want, from your list.', cost: 600 },
  cursed_box: { name: 'Cursed Random Box', description: 'Contains an item you need.', cost: 200 },
} as const;
export type SystemItemId = keyof typeof SYSTEM_ITEMS;

export const MP_POTION_AMOUNT = 30;

// ---------- behaviour design (docs/behavior-design.md) ----------

/** A first missed day is a Slip: this share of the full penalty, streak survives. */
export const SLIP_PENALTY_FACTOR = 0.5;
/** Clearing the day after a miss: bonus share of that day's EXP and gold. */
export const COMEBACK_BONUS = 0.5;
/** Minimum Clear: share of EXP/gold, and of habit-strength growth. */
export const MIN_CLEAR_REWARD = 0.3;
export const MIN_CLEAR_STRENGTH = 0.5;

/** Habit strength (0–100) grows toward 100 by this share per completion: ~66 reps → ~95%. */
export const STRENGTH_GROWTH = 0.045;
/** Multiplier on a miss, by consecutive-miss count (1, 2, 3+). */
export const STRENGTH_MISS_DECAY = [0.96, 0.92, 0.85] as const;
export const CHECKIN_MIN_STRENGTH = 60;
export const CHECKIN_INTERVAL_DAYS = 7;
export const MASTERY_MIN_STRENGTH = 85;
export const MASTERY_MIN_CHECKIN = 5.5;
/** A mastered quest below this strength is Weakened and acts like a normal quest. */
export const WEAKENED_BELOW = 60;
export const MASTERED_XP_FACTOR = 0.5;
export const PASSIVE_STAT_BONUS = 5;

/** Self-Report Behavioural Automaticity Index (Gardner et al. 2012), 1–7 agreement. */
export const SRBAI_ITEMS = [
  'I do automatically',
  'I do without having to consciously remember',
  'I do without thinking',
  "I start doing before I realise I'm doing it",
] as const;

/** Surprise drops. Rolled once per quest per day (seeded), so they can't be re-rolled. */
export const GOAL_DROP_CHANCE = 0.12;
export const CLEAR_DROP_CHANCE = 0.35;
export const CRITICAL_CHANCE = 0.05;
export const RARITIES = ['Normal', 'Rare', 'Epic', 'Unique', 'Legendary'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_WEIGHTS: Record<Rarity, number> = { Normal: 60, Rare: 25, Epic: 10, Unique: 4, Legendary: 1 };
export const DROP_VALUES: Record<Rarity, { gold: number; xp: number; mp: number }> = {
  Normal: { gold: 30, xp: 20, mp: 10 },
  Rare: { gold: 80, xp: 50, mp: 20 },
  Epic: { gold: 200, xp: 120, mp: 30 },
  Unique: { gold: 500, xp: 300, mp: 45 },
  Legendary: { gold: 1200, xp: 800, mp: 60 },
};

/** Weekly Gate: keep this many days Mon–Sun. The card starts with one bonus stamp. */
export const GATE_DAYS_REQUIRED = 5;
export const GATE_REWARD = { xp: 300, gold: 250 };

/** Streak milestones shown as the next target. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 45, 66, 100, 150, 200, 365] as const;

/** Season (calendar month) titles by kept days. */
export const SEASON_TITLES: { minDays: number; title: string }[] = [
  { minDays: 26, title: 'Monarch of the Season' },
  { minDays: 21, title: 'S-Rank Season' },
  { minDays: 15, title: 'A-Rank Season' },
];

/** Quest upgrade/downgrade offers. */
export const UPGRADE_AFTER_CLEAN_DAYS = 14;
export const UPGRADE_FACTOR = 1.2;
export const DOWNGRADE_MISSES_IN_7 = 3;
export const DOWNGRADE_FACTOR = 0.7;
export const OFFER_COOLDOWN_DAYS = 14;

/** Identity titles suggested on mastery, by stat. */
export const IDENTITY_TITLES: Record<Stat, string> = {
  STR: 'The Unyielding',
  AGI: 'The Swift',
  STA: 'The Enduring',
  INT: 'The Scholar',
  SENSE: 'The Perceptive',
};

/** Every stat starts here. */
export const BASE_STAT = 10;

/** Completions of a habit needed to raise its stat by 1. */
export const COMPLETIONS_PER_STAT_POINT = 5;

/** EXP needed to go from `level` to `level + 1`. */
export function xpToNextLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.4));
}

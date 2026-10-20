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

/** Every stat starts here. */
export const BASE_STAT = 10;

/** Completions of a habit needed to raise its stat by 1. */
export const COMPLETIONS_PER_STAT_POINT = 5;

/** EXP needed to go from `level` to `level + 1`. */
export function xpToNextLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.4));
}

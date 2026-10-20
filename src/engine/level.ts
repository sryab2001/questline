import { RANK_MIN_LEVEL, RANKS, type Rank, xpToNextLevel } from './rules';

export interface LevelInfo {
  level: number;
  /** EXP earned inside the current level. */
  xpIntoLevel: number;
  /** EXP the current level needs in total. */
  xpForNext: number;
}

export function levelFromTotalXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForNext: xpToNextLevel(level) };
}

export function rankForLevel(level: number): Rank {
  let rank: Rank = 'E';
  for (const r of RANKS) {
    if (level >= RANK_MIN_LEVEL[r]) rank = r;
  }
  return rank;
}

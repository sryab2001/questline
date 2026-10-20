import { describe, expect, it } from 'vitest';

import { levelFromTotalXp, rankForLevel } from './level';
import { xpToNextLevel } from './rules';

describe('levelFromTotalXp', () => {
  it('starts at level 1 with no EXP', () => {
    expect(levelFromTotalXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNext: xpToNextLevel(1) });
  });

  it('levels up exactly at the threshold and carries the remainder', () => {
    const toTwo = xpToNextLevel(1);
    expect(levelFromTotalXp(toTwo - 1).level).toBe(1);
    expect(levelFromTotalXp(toTwo).level).toBe(2);
    expect(levelFromTotalXp(toTwo + 7)).toMatchObject({ level: 2, xpIntoLevel: 7 });
  });

  it('can jump several levels at once', () => {
    const total = xpToNextLevel(1) + xpToNextLevel(2) + xpToNextLevel(3);
    expect(levelFromTotalXp(total).level).toBe(4);
  });
});

describe('rankForLevel', () => {
  it('maps levels to hunter ranks', () => {
    expect(rankForLevel(1)).toBe('E');
    expect(rankForLevel(19)).toBe('E');
    expect(rankForLevel(20)).toBe('D');
    expect(rankForLevel(99)).toBe('A');
    expect(rankForLevel(100)).toBe('S');
  });
});

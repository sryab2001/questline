// Achievements unlock titles (Overgeared-style): some grant permanent "first-clear"
// stat bonuses or an item, and each title has a small effect while equipped.
import type { Effect } from './items';
import type { Rarity, Stat } from './rules';

/** Running counts the engine keeps while replaying history. */
export interface Progress {
  daysCleared: number;
  maxStreak: number;
  gatesCleared: number;
  comebacks: number;
  survivals: number;
  minClears: number;
  masteries: number;
  legendaryDrops: number;
  level: number;
  jobChanged: number;
  classQuestsDone: number;
  forged: number;
}

export interface AchievementDef {
  id: string;
  /** The title it grants. */
  title: string;
  description: string;
  metric: keyof Progress;
  target: number;
  /** Permanent bonus to every stat once unlocked (first-clear bonus). */
  allStats?: number;
  item?: Rarity;
  /** Active only while the title is equipped. */
  titleEffect: Effect;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_clear', title: 'First Step', description: 'Clear a Daily Quest for the first time.', metric: 'daysCleared', target: 1, allStats: 1, titleEffect: { kind: 'xp_pct', value: 2 } },
  { id: 'streak_7', title: 'The Persistent', description: 'Reach a 7-day streak.', metric: 'maxStreak', target: 7, item: 'Rare', titleEffect: { kind: 'xp_pct', value: 5 } },
  { id: 'streak_30', title: 'Unbroken', description: 'Reach a 30-day streak.', metric: 'maxStreak', target: 30, allStats: 1, item: 'Epic', titleEffect: { kind: 'xp_pct', value: 8 } },
  { id: 'streak_66', title: 'Second Nature', description: 'Reach a 66-day streak, the median time to form a habit.', metric: 'maxStreak', target: 66, allStats: 2, item: 'Unique', titleEffect: { kind: 'gold_pct', value: 10 } },
  { id: 'gate_1', title: 'Gatebreaker', description: 'Clear your first weekly Gate.', metric: 'gatesCleared', target: 1, titleEffect: { kind: 'gold_pct', value: 5 } },
  { id: 'gate_10', title: 'Gate Lord', description: 'Clear 10 weekly Gates.', metric: 'gatesCleared', target: 10, item: 'Epic', titleEffect: { kind: 'gold_pct', value: 8 } },
  { id: 'comeback_5', title: 'Indomitable', description: 'Come back after a miss 5 times.', metric: 'comebacks', target: 5, titleEffect: { kind: 'hp_per_kept', value: 3 } },
  { id: 'survivor', title: 'Survivor', description: 'Clear a Penalty Quest.', metric: 'survivals', target: 1, titleEffect: { kind: 'hp_per_kept', value: 2 } },
  { id: 'composed', title: 'Composed', description: 'Keep 10 days on a Minimum Clear.', metric: 'minClears', target: 10, titleEffect: { kind: 'hp_per_kept', value: 2 } },
  { id: 'awakened', title: 'Awakened', description: 'Master your first quest.', metric: 'masteries', target: 1, allStats: 1, item: 'Epic', titleEffect: { kind: 'mp_per_goal', value: 1 } },
  { id: 'fortune', title: 'Blessed by Fortune', description: 'Receive a Legendary drop.', metric: 'legendaryDrops', target: 1, titleEffect: { kind: 'gold_pct', value: 10 } },
  { id: 'rank_d', title: 'D-Rank Hunter', description: 'Reach level 20.', metric: 'level', target: 20, allStats: 1, titleEffect: { kind: 'xp_pct', value: 3 } },
  { id: 'job_change', title: 'Reborn', description: 'Complete the Job Change.', metric: 'jobChanged', target: 1, titleEffect: { kind: 'xp_pct', value: 3 } },
  { id: 'path_walker', title: 'Path Walker', description: 'Complete a Main Quest.', metric: 'classQuestsDone', target: 1, titleEffect: { kind: 'xp_pct', value: 5 } },
  { id: 'blacksmith', title: 'Blacksmith', description: 'Forge your first item.', metric: 'forged', target: 1, item: 'Rare', titleEffect: { kind: 'min_clear_pct', value: 10 } },
  { id: 'shadow_monarch', title: 'Shadow Monarch', description: 'Extract 3 Shadows: master three quests.', metric: 'masteries', target: 3, allStats: 2, item: 'Legendary', titleEffect: { kind: 'grace_slip', value: 1 } },
];

export const ACHIEVEMENT_BY_TITLE = new Map(ACHIEVEMENTS.map((a) => [a.title, a]));

// ---------- Jobs ----------

export const JOB_CHANGE_LEVEL = 10;
export const JOB_TRIAL_DAYS = 3;
export const JOB_XP_BONUS = 10;

export const JOBS: Record<Stat, { id: string; name: string; description: string }> = {
  STR: { id: 'sun_knight', name: 'Sun Knight', description: 'A warrior who praises the sun. +10% EXP from STR quests.' },
  AGI: { id: 'shadow_runner', name: 'Shadow Runner', description: 'Swift and tireless. +10% EXP from AGI quests.' },
  STA: { id: 'iron_warden', name: 'Iron Warden', description: 'Endures anything. +10% EXP from STA quests.' },
  INT: { id: 'arcane_scholar', name: 'Arcane Scholar', description: 'Knowledge is power. +10% EXP from INT quests.' },
  SENSE: { id: 'seer', name: 'Seer', description: 'Sees what others miss. +10% EXP from SENSE quests.' },
};

export const JOB_BY_ID = new Map(Object.entries(JOBS).map(([stat, j]) => [j.id, { ...j, stat: stat as Stat }]));

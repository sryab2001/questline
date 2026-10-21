// Main Quests: long-term goals split into chapters of small quests, each chapter
// ending with a Boss (a build or practice project). Chapters open in order; quests
// inside a chapter can be done in any order, the Boss last.
import type { DayKey } from './day';
import { chainRarity } from './items';
import { BOSS_GOLD, BOSS_XP_MULT, GOAL_XP, type Grade, GRADES, type Rarity, type Stat, STATS, TASK_GOLD, TASK_XP_MULT } from './rules';

export type TaskType = 'learn' | 'practice' | 'build';
export const TASK_TYPES: TaskType[] = ['learn', 'practice', 'build'];

export interface QuestTask {
  title: string;
  type: TaskType;
  grade: Grade;
  /** The chapter's Boss: opens once every other quest in the chapter is done. */
  boss?: boolean;
  /** Counted quest ("Read 3 papers"): done when count reaches target. */
  target?: number | null;
  count?: number;
  doneDay: DayKey | null;
  /** "What I learned", written when the quest is cleared. */
  note?: string;
  link?: string;
}

export interface Chapter {
  title: string;
  /** Real-life reward committed in advance, paid out when the chapter is cleared. */
  bounty?: string;
  tasks: QuestTask[];
}

export interface MainQuestData {
  v: 2;
  /** Stat the quest trains; finishing a multi-chapter quest raises it. */
  stat: Stat;
  /** Daily quest that feeds this goal ("Study GenAI 30 min"). */
  habitId: string | null;
  /** Real-life reward for finishing the whole quest. */
  bounty: string;
  /** Title earned on completion (multi-chapter quests). */
  title: string;
  /** Quest Board template it was accepted from, if any. */
  templateId?: string;
  chapters: Chapter[];
}

export interface MainQuestInput {
  id: string;
  name: string;
  data: MainQuestData;
}

const DEFAULT_GRADE: Record<TaskType, Grade> = { learn: 'D', practice: 'C', build: 'B' };

/** Reads stored quest JSON. Phase 5 Class Quests (a plain list of steps) become one chapter. */
export function parseMainQuest(json: string): MainQuestData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    raw = [];
  }
  if (Array.isArray(raw)) {
    return {
      v: 2,
      stat: 'INT',
      habitId: null,
      bounty: '',
      title: '',
      chapters: [
        {
          title: 'Chapter 1',
          tasks: raw.map((s: { title?: string; grade?: Grade; target?: number | null; count?: number; doneDay?: DayKey | null }) => ({
            title: s.title ?? '',
            type: 'practice' as const,
            grade: s.grade ?? 'C',
            target: s.target ?? null,
            count: s.count ?? 0,
            doneDay: s.doneDay ?? null,
          })),
        },
      ],
    };
  }
  const d = raw as Partial<MainQuestData>;
  return {
    v: 2,
    stat: d.stat && STATS.includes(d.stat) ? d.stat : 'INT',
    habitId: d.habitId ?? null,
    bounty: d.bounty ?? '',
    title: d.title ?? '',
    ...(d.templateId ? { templateId: d.templateId } : {}),
    chapters: (d.chapters ?? []).map((c) => ({ title: c.title ?? '', bounty: c.bounty ?? '', tasks: c.tasks ?? [] })),
  };
}

export function taskXp(t: Pick<QuestTask, 'grade' | 'type' | 'boss'>): number {
  return GOAL_XP[t.grade] * (t.boss ? BOSS_XP_MULT : TASK_XP_MULT[t.type]);
}

export function taskGold(t: Pick<QuestTask, 'boss'>): number {
  return t.boss ? BOSS_GOLD : TASK_GOLD;
}

/** Day the chapter was cleared: its Boss's day, or the last quest's day when there is no Boss. */
export function chapterClearedDay(ch: Chapter): DayKey | null {
  if (ch.tasks.length === 0 || ch.tasks.some((t) => !t.doneDay)) return null;
  const boss = ch.tasks.find((t) => t.boss);
  if (boss) return boss.doneDay;
  return ch.tasks.map((t) => t.doneDay!).sort().at(-1)!;
}

/** Index of the first chapter not yet cleared (= chapters.length when the quest is complete). */
export function currentChapter(data: MainQuestData): number {
  const i = data.chapters.findIndex((c) => !chapterClearedDay(c));
  return i < 0 ? data.chapters.length : i;
}

/** Whether a quest in a chapter can be worked on now. */
export function taskOpen(data: MainQuestData, ci: number, ti: number): boolean {
  if (ci !== currentChapter(data)) return false;
  const ch = data.chapters[ci];
  const t = ch.tasks[ti];
  if (t.doneDay) return false;
  return !t.boss || ch.tasks.every((o) => o.boss || o.doneDay);
}

export function isMultiChapter(data: MainQuestData): boolean {
  return data.chapters.length > 1;
}

/** Item rarity for clearing a chapter's Boss, by the chapter's size. */
export function chapterRarity(ch: Chapter): Rarity {
  if (ch.tasks.length >= 6) return 'Unique';
  if (ch.tasks.length >= 4) return 'Epic';
  return 'Rare';
}

/** Item rarity for finishing the whole quest. */
export function questRarity(data: MainQuestData): Rarity {
  if (!isMultiChapter(data)) return chainRarity(data.chapters[0]?.tasks.length ?? 0);
  return data.chapters.length >= 4 ? 'Legendary' : 'Unique';
}

export function questTitle(name: string, data: MainQuestData): string {
  return data.title.trim() || `${name.trim()} Conqueror`;
}

/**
 * Turns an indented outline into chapters. Unindented lines are chapters, indented
 * lines are quests. A quest line may start with "Learn:", "Practice:", "Build:" or
 * "Boss:", end with a grade in brackets "[B]", and carry a count "x3" or "×3".
 *
 *   Foundations
 *     How LLMs work
 *     Practice: Call an LLM API
 *     Read 3 papers x3
 *     Boss: Build an MCP server over my notes [B]
 */
export function parseOutline(text: string): Chapter[] {
  const chapters: Chapter[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const indented = /^\s/.test(rawLine) || /^[-*•]\s/.test(rawLine);
    let line = rawLine.trim().replace(/^[-*•]\s*/, '');
    if (!indented) {
      chapters.push({ title: line, bounty: '', tasks: [] });
      continue;
    }
    if (chapters.length === 0) chapters.push({ title: 'Chapter 1', bounty: '', tasks: [] });

    let type: TaskType = 'learn';
    let boss = false;
    const prefix = line.match(/^(learn|practice|build|boss)\s*:\s*/i);
    if (prefix) {
      const p = prefix[1].toLowerCase();
      boss = p === 'boss';
      type = boss ? 'build' : (p as TaskType);
      line = line.slice(prefix[0].length);
    }
    let grade: Grade = boss ? 'B' : DEFAULT_GRADE[type];
    const g = line.match(/\s*\[([FEDCBAS])\]\s*$/i);
    if (g) {
      grade = g[1].toUpperCase() as Grade;
      line = line.slice(0, g.index);
    }
    let target: number | null = null;
    const c = line.match(/\s+[x×](\d+)\s*$/i);
    if (c) {
      target = Math.max(1, Number(c[1]));
      line = line.slice(0, c.index);
    }
    if (!GRADES.includes(grade)) grade = 'C';
    chapters.at(-1)!.tasks.push({ title: line.trim(), type, grade, boss, target: target && target > 1 ? target : null, count: 0, doneDay: null });
  }
  // One Boss per chapter, always last; any extra "Boss:" lines become build quests.
  for (const ch of chapters) {
    const bosses = ch.tasks.filter((t) => t.boss);
    ch.tasks = [...ch.tasks.filter((t) => !t.boss), ...bosses.slice(1).map((b) => ({ ...b, boss: false })), ...bosses.slice(0, 1)];
  }
  return chapters.filter((ch) => ch.title || ch.tasks.length > 0);
}

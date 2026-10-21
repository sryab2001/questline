import { describe, expect, it } from 'vitest';

import { currentChapter, isMultiChapter, parseMainQuest, questRarity } from './main-quests';
import { BOARD_CATEGORIES, QUEST_BOARD, questFromTemplate } from './quest-board';
import { GRADES } from './rules';

describe('Quest Board templates', () => {
  it('has eight templates with unique ids and known categories', () => {
    expect(QUEST_BOARD).toHaveLength(8);
    expect(new Set(QUEST_BOARD.map((t) => t.id)).size).toBe(8);
    for (const t of QUEST_BOARD) expect(BOARD_CATEGORIES).toContain(t.category);
  });

  it.each(QUEST_BOARD.map((t) => [t.name, t] as const))('%s parses into chapters that each end with a Boss', (_name, t) => {
    const q = questFromTemplate(t, null);
    expect(q.chapters.length).toBeGreaterThanOrEqual(3);
    expect(isMultiChapter(q)).toBe(true);
    for (const ch of q.chapters) {
      expect(ch.title.trim()).not.toBe('');
      expect(ch.tasks.length).toBeGreaterThanOrEqual(3);
      expect(ch.tasks.filter((x) => x.boss)).toHaveLength(1);
      expect(ch.tasks.at(-1)!.boss).toBe(true);
      for (const task of ch.tasks) {
        expect(task.title.trim()).not.toBe('');
        expect(task.title).not.toMatch(/\[[A-Z]\]|\sx\d+$|^(learn|practice|build|boss):/i);
        expect(GRADES).toContain(task.grade);
        expect(task.doneDay).toBeNull();
      }
    }
    expect(currentChapter(q)).toBe(0);
    expect(['Unique', 'Legendary']).toContain(questRarity(q));
  });

  it('keeps counts, the template id and the linked habit through storage', () => {
    const t = QUEST_BOARD.find((x) => x.id === 'genai-engineer')!;
    const q = parseMainQuest(JSON.stringify(questFromTemplate(t, 'habit-1')));
    expect(q).toMatchObject({ templateId: 'genai-engineer', habitId: 'habit-1', title: 'Machine Mind Engineer', stat: 'INT' });
    const papers = q.chapters.flatMap((c) => c.tasks).find((x) => x.title.startsWith('Read 3 engineering'))!;
    expect(papers).toMatchObject({ target: 3, grade: 'C', type: 'learn' });
    expect(q.chapters.at(-1)!.tasks.at(-1)).toMatchObject({ boss: true, grade: 'S' });
  });
});

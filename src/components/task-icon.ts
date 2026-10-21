import type { TaskType } from '@/engine';

/** Icon per Main Quest type; a chapter's Boss gets crossed swords. */
export const TASK_ICON: Record<TaskType | 'boss', 'book-open-variant' | 'dumbbell' | 'hammer-wrench' | 'sword-cross'> = {
  learn: 'book-open-variant',
  practice: 'dumbbell',
  build: 'hammer-wrench',
  boss: 'sword-cross',
};

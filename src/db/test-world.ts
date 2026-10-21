// Test World: a separate local database pre-filled with ~80 days of history, so
// levels, Gates, achievements, items, mastery and the Job Change can be tried
// without touching real data. Only raw history is written; the engine derives
// EXP, gold, levels and rewards from it exactly as it does for real play.
import { isNull } from 'drizzle-orm';

import { addDays, type DayKey, gateItem, weekday } from '@/engine';
import { uuidv7 } from '@/lib/uuid';

import { acknowledgeDays, closePendingDays, ensureSettings, todayKey, updateSettings } from './actions';
import { db, isTestWorld } from './client';
import {
  checkins,
  classQuests,
  dayResults,
  events,
  habits,
  logs,
  purchases,
  settings,
  skillUses,
  statAllocations,
  storeItems,
  unlocks,
} from './schema';

const DAYS = 80;

/** Day index (0 = first day) → which habits are missed or only at minimum. */
const MISSED_ALL = new Set([18, 40, 41, 60]);

const HABITS = [
  { name: 'Push-ups', stat: 'STR', target: 100, unit: 'reps', grade: 'E', minTarget: 20, cue: 'brushing my teeth' },
  { name: 'Run', stat: 'AGI', target: 5, unit: 'km', grade: 'D', minTarget: 1, cue: 'my morning coffee' },
  { name: 'Read', stat: 'INT', target: 20, unit: 'pages', grade: 'E', minTarget: null, cue: 'dinner' },
  { name: 'Meditate', stat: 'SENSE', target: 10, unit: 'min', grade: 'E', minTarget: 2, cue: 'waking up' },
  { name: 'Sleep before 23:00', stat: 'STA', target: 1, unit: '', grade: 'E', minTarget: null, cue: 'setting my alarm' },
  { name: 'Study GenAI', stat: 'INT', target: 45, unit: 'min', grade: 'C', minTarget: 15, cue: 'lunch' },
] as const;

const at = (day: DayKey, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`);
const row = (day: DayKey, hour = 12) => ({ id: uuidv7(), createdAt: at(day, hour), updatedAt: at(day, hour), dirty: true });
const monday = (day: DayKey) => addDays(day, -((weekday(day) + 6) % 7));

async function wipe() {
  for (const t of [settings, habits, logs, dayResults, statAllocations, skillUses, unlocks, classQuests, checkins, events, storeItems, purchases]) {
    await db.delete(t);
  }
}

/** Fills the Test World only when it is empty. */
export async function seedTestWorldIfEmpty() {
  if (!isTestWorld()) return;
  const any = await db.select({ id: habits.id }).from(habits).where(isNull(habits.deletedAt)).limit(1);
  if (any.length === 0) await seedTestWorld();
}

export async function seedTestWorld() {
  if (!isTestWorld()) throw new Error('Refusing to seed outside the Test World');
  await wipe();
  await ensureSettings();
  await updateSettings({ playerName: 'Test Hunter', onboarded: true, urgentFrequency: 'often', title: 'The Persistent' });

  const today = await todayKey();
  const start = addDays(today, -DAYS);
  const day = (i: number) => addDays(start, i);

  // Quests, all started on day 0. Read was mastered on day 55.
  const ids = HABITS.map(() => uuidv7());
  await db.insert(habits).values(
    HABITS.map((h, i) => ({
      ...row(start, 8),
      id: ids[i],
      ...h,
      schedule: 'daily',
      sortOrder: i,
      startDay: start,
      ...(h.name === 'Read'
        ? { masteredAt: at(day(55)), masteryName: "Scholar's Focus", masteryTitle: 'The Scholar' }
        : {}),
    })),
  );

  // History: mostly full clears, Minimum Clears every 9th day, a slip on day 18,
  // a slip + failure on days 40–41 (streak reset), a lone slip on day 60.
  const logRows: (typeof logs.$inferInsert)[] = [];
  for (let i = 0; i < DAYS; i++) {
    if (MISSED_ALL.has(i)) continue;
    HABITS.forEach((h, j) => {
      const atMin = i % 9 === 4 && h.minTarget !== null && j % 2 === 0;
      logRows.push({ ...row(day(i), 19), habitId: ids[j], day: day(i), amount: atMin ? h.minTarget! : h.target });
    });
  }
  // Today: two quests done, the rest left to try.
  [0, 3].forEach((j) => logRows.push({ ...row(today, 9), habitId: ids[j], day: today, amount: HABITS[j].target }));
  for (let k = 0; k < logRows.length; k += 200) await db.insert(logs).values(logRows.slice(k, k + 200));

  // Weekly automaticity check-ins: high for Read (mastered) and Meditate (close to a Mastery Trial).
  const checkinRows: (typeof checkins.$inferInsert)[] = [];
  for (let i = 28; i < DAYS; i += 7) {
    checkinRows.push({ ...row(day(i), 20), habitId: ids[2], day: day(i), scoresJson: '[6,6,7,6]', avg: 6.25 });
    checkinRows.push({ ...row(day(i), 20), habitId: ids[3], day: day(i), scoresJson: '[6,5,6,6]', avg: 5.75 });
  }
  await db.insert(checkins).values(checkinRows);

  // Player decisions, in order: title, mastery, equipment, Job Change trial.
  const gateWeek = monday(day(14));
  const gateReward = gateItem(gateWeek);
  await db.insert(events).values([
    { ...row(day(10), 21), kind: 'title', ref: 'The Persistent', day: day(10), dataJson: null },
    { ...row(day(55), 21), kind: 'offer', ref: ids[2], day: day(55), dataJson: JSON.stringify({ kind: 'mastery', accepted: true }) },
    { ...row(addDays(gateWeek, 7), 9), kind: 'equip', ref: gateReward.slot, day: addDays(gateWeek, 7), dataJson: JSON.stringify({ itemId: gateReward.id }) },
    { ...row(addDays(today, -4), 9), kind: 'job_trial', ref: 'start', day: addDays(today, -4), dataJson: null },
  ]);

  // Class Quests: one nearly finished chain, one counted goal, one just started.
  const step = (title: string, grade: string, doneDay: DayKey | null, target?: number, count?: number) => ({
    title,
    grade,
    doneDay,
    ...(target ? { target, count: count ?? 0 } : {}),
  });
  const quests = [
    { name: 'Path of the Runner', steps: [step('Run 5 km without stopping', 'D', day(20)), step('Run 10 km', 'C', day(50)), step('Half marathon', 'A', null)] },
    { name: 'Read 12 books', steps: [step('Finish books', 'B', null, 12, 7)] },
    {
      name: 'Learn GenAI',
      steps: [step('LLM basics: tokens, context, sampling', 'D', day(70)), step('Embeddings & MCP', 'C', null), step('Build a RAG demo', 'B', null), step('Build an agent', 'A', null)],
    },
  ];
  await db.insert(classQuests).values(
    quests.map((q) => {
      const open = q.steps.findIndex((s) => !s.doneDay);
      return { ...row(day(15)), name: q.name, rating: '', stepsJson: JSON.stringify(q.steps), currentStep: open, status: 'active' as const };
    }),
  );

  // Store: real-life treats, one already bought.
  const treats = [
    { name: 'Gaming hour', cost: 300 },
    { name: 'Movie night', cost: 800 },
    { name: 'New book', cost: 1500 },
    { name: 'Eat out', cost: 2000 },
  ].map((t) => ({ ...row(start, 9), ...t, kind: 'treat' as const }));
  await db.insert(storeItems).values(treats);
  await db.insert(purchases).values({ ...row(day(30), 20), storeItemId: treats[0].id, cost: 300, kind: 'treat', day: day(30) });

  // Freeze the past days through the normal day close, then mark them seen so
  // old penalties don't pop up. Level-up, rewards and the Season recap still show once.
  await closePendingDays();
  const closed = await db.select({ day: dayResults.day }).from(dayResults);
  await acknowledgeDays(closed.map((r) => r.day));
}

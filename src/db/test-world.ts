// Test World: a separate local database pre-filled with ~80 days of history, so
// levels, Gates, achievements, items, mastery and the Job Change can be tried
// without touching real data. Only raw history is written; the engine derives
// EXP, gold, levels and rewards from it exactly as it does for real play.
import { isNull } from 'drizzle-orm';

import {
  addDays,
  currentChapter,
  type DayKey,
  gateItem,
  type Grade,
  type MainQuestData,
  type QuestTask,
  type TaskType,
  weekday,
} from '@/engine';
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
  routines,
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
  for (const t of [settings, habits, logs, dayResults, statAllocations, skillUses, unlocks, classQuests, checkins, events, storeItems, purchases, routines]) {
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
  // A screen-time Limit Quest with a reading every day (always under its 3-hour limit).
  const phoneId = uuidv7();
  await db.insert(habits).values({
    ...row(start, 8),
    id: phoneId,
    name: 'Phone under 3 h',
    stat: 'SENSE',
    target: 180,
    unit: 'min',
    grade: 'C',
    schedule: 'daily',
    sortOrder: HABITS.length,
    startDay: start,
    limitSource: 'screen_time',
  });
  for (let i = 0; i <= DAYS; i++) {
    const d = i === DAYS ? today : day(i);
    logRows.push({ ...row(d, 22), habitId: phoneId, day: d, amount: i === DAYS ? 75 : 100 + ((i * 37) % 70) });
  }
  for (let k = 0; k < logRows.length; k += 200) await db.insert(logs).values(logRows.slice(k, k + 200));

  // A morning routine: Meditate → Push-ups → Read.
  await db.insert(routines).values({ ...row(start, 8), name: 'Morning routine', habitIdsJson: JSON.stringify([ids[3], ids[0], ids[2]]), sortOrder: 0 });

  // Weekly automaticity check-ins: high for Read (mastered) and Meditate (close to a Mastery Trial).
  const checkinRows: (typeof checkins.$inferInsert)[] = [];
  for (let i = 28; i < DAYS; i += 7) {
    checkinRows.push({ ...row(day(i), 20), habitId: ids[2], day: day(i), scoresJson: '[6,6,7,6]', avg: 6.25 });
    checkinRows.push({ ...row(day(i), 20), habitId: ids[3], day: day(i), scoresJson: '[6,5,6,6]', avg: 5.75 });
  }
  await db.insert(checkins).values(checkinRows);

  // Player decisions, in order: economy v2 from day 0, title, mastery, equipment, Job Change trial.
  const gateWeek = monday(day(14));
  const gateReward = gateItem(gateWeek);
  await db.insert(events).values([
    { ...row(start, 7), kind: 'economy', ref: 'v2', day: start, dataJson: null },
    { ...row(day(10), 21), kind: 'title', ref: 'The Persistent', day: day(10), dataJson: null },
    { ...row(day(55), 21), kind: 'offer', ref: ids[2], day: day(55), dataJson: JSON.stringify({ kind: 'mastery', accepted: true }) },
    { ...row(addDays(gateWeek, 7), 9), kind: 'equip', ref: gateReward.slot, day: addDays(gateWeek, 7), dataJson: JSON.stringify({ itemId: gateReward.id }) },
    { ...row(addDays(today, -4), 9), kind: 'job_trial', ref: 'start', day: addDays(today, -4), dataJson: null },
  ]);

  // Main Quests: a multi-chapter learning path (first chapter cleared, its bounty
  // waiting to be claimed), a short chain one step from done, and a counted goal.
  const task = (title: string, type: TaskType, grade: Grade, doneDay: DayKey | null, extra: Partial<QuestTask> = {}): QuestTask => ({
    title,
    type,
    grade,
    doneDay,
    ...extra,
  });
  const genai: MainQuestData = {
    v: 2,
    stat: 'INT',
    habitId: ids[5],
    bounty: 'Mechanical keyboard',
    title: 'Machine Mind Scholar',
    chapters: [
      {
        title: 'Foundations',
        bounty: 'Buy the AI Engineering book',
        tasks: [
          task('How LLMs work: tokens, context, sampling', 'learn', 'D', day(62), { note: 'Sampling temperature trades accuracy for variety.' }),
          task('Call an LLM API from code', 'practice', 'C', day(64)),
          task('Embeddings & vector similarity', 'learn', 'D', day(66)),
          task('MCP: tools, resources, prompts', 'learn', 'D', day(69)),
          task('Build an MCP server over my notes', 'build', 'B', day(72), { boss: true }),
        ],
      },
      {
        title: 'RAG',
        tasks: [
          task('Chunking strategies', 'learn', 'D', day(75)),
          task('Vector DB + hybrid search', 'practice', 'C', day(77)),
          task('Read 3 RAG papers', 'learn', 'C', null, { target: 3, count: 1 }),
          task('Build a 20-question eval set', 'practice', 'C', null),
          task('RAG over my docs with citations + eval', 'build', 'A', null, { boss: true }),
        ],
      },
      {
        title: 'Agents',
        tasks: [
          task('The tool-use loop', 'learn', 'C', null),
          task('Planning and memory', 'learn', 'C', null),
          task('Build an agent that files my receipts', 'build', 'A', null, { boss: true }),
        ],
      },
      {
        title: 'Context engineering & harnesses',
        tasks: [
          task('Compaction, retrieval, caching', 'learn', 'B', null),
          task('Evals for agents', 'practice', 'B', null),
          task('Build a mini harness with evals', 'build', 'S', null, { boss: true }),
        ],
      },
    ],
  };
  const oneChapter = (title: string, tasks: QuestTask[]): MainQuestData => ({
    v: 2,
    stat: 'AGI',
    habitId: null,
    bounty: '',
    title: '',
    chapters: [{ title, tasks }],
  });
  const quests: { name: string; data: MainQuestData }[] = [
    { name: 'Learn GenAI', data: genai },
    {
      name: 'Path of the Runner',
      data: {
        ...oneChapter('Distance', [
          task('Run 5 km without stopping', 'practice', 'D', day(20)),
          task('Run 10 km', 'practice', 'C', day(50)),
          task('Half marathon', 'build', 'A', null, { boss: true }),
        ]),
        habitId: ids[1],
        bounty: 'New running shoes',
      },
    },
    { name: 'Read 12 books', data: { ...oneChapter('Books', [task('Finish books', 'practice', 'B', null, { target: 12, count: 7 })]), stat: 'INT' } },
  ];
  await db.insert(classQuests).values(
    quests.map((q) => ({
      ...row(day(15)),
      name: q.name,
      rating: '',
      stepsJson: JSON.stringify(q.data),
      currentStep: currentChapter(q.data),
      status: 'active' as const,
    })),
  );

  // Store: treats priced in days of effort (one already bought), and free unlocks.
  const treats = [
    { name: 'Favourite coffee', cost: 100 },
    { name: 'Movie night', cost: 500 },
    { name: 'New book', cost: 1000 },
    { name: 'Day trip', cost: 3000 },
  ].map((t) => ({ ...row(start, 9), ...t, kind: 'treat' as const }));
  const unlockRows = ['Evening gaming', 'YouTube after dinner'].map((name) => ({ ...row(start, 9), name, cost: 0, kind: 'unlock' as const }));
  await db.insert(storeItems).values([...treats, ...unlockRows]);
  await db.insert(purchases).values({ ...row(day(30), 20), storeItemId: treats[1].id, cost: 500, kind: 'treat', day: day(30) });

  // Freeze the past days through the normal day close, then mark them seen so
  // old penalties don't pop up. Level-up, rewards and the Season recap still show once.
  await closePendingDays();
  const closed = await db.select({ day: dayResults.day }).from(dayResults);
  await acknowledgeDays(closed.map((r) => r.day));
}

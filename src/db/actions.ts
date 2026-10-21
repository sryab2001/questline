import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  addDays,
  type BoxResult,
  dayKey,
  daysToClose,
  evaluateDay,
  type Grade,
  GRADES,
  currentChapter,
  type Habit,
  type MainQuestData,
  type OfferKind,
  type QuestOffer,
  type Slot,
  rollBlessedBox,
  rollCursedBox,
  type SkillId,
  type Stat,
  type SurvivalQuest,
  SYSTEM_ITEMS,
  type SystemItemId,
} from '@/engine';
import { uuidv7 } from '@/lib/uuid';

import { db } from './client';
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
} from './schema';

const SETTINGS_ID = 'settings';

function stamps() {
  const now = new Date();
  return { createdAt: now, updatedAt: now, dirty: true };
}

function touched() {
  return { updatedAt: new Date(), dirty: true };
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

// ---------- settings ----------

/**
 * Creates the single settings row on first launch. It is stamped as the oldest
 * possible version and not dirty, so restoring from the server always wins over
 * a fresh install's defaults.
 */
export async function ensureSettings() {
  await db
    .insert(settings)
    .values({
      id: SETTINGS_ID,
      createdAt: new Date(),
      updatedAt: new Date(0),
      dirty: false,
      playerName: 'Hunter',
      timeZone: deviceTimeZone(),
      resetHour: 0,
    })
    .onConflictDoNothing();
}

export async function getSettings() {
  const row = await db.query.settings.findFirst({ where: eq(settings.id, SETTINGS_ID) });
  if (!row) throw new Error('Settings missing; ensureSettings() must run first');
  return row;
}

export type SettingsPatch = Partial<
  Pick<
    typeof settings.$inferInsert,
    | 'playerName'
    | 'resetHour'
    | 'morningHour'
    | 'warningHour'
    | 'lastSeenLevel'
    | 'timeZone'
    | 'onboarded'
    | 'soundOn'
    | 'surprisesOn'
    | 'title'
    | 'urgentFrequency'
  >
>;

export async function updateSettings(patch: SettingsPatch) {
  await db.update(settings).set({ ...patch, ...touched() }).where(eq(settings.id, SETTINGS_ID));
}

export async function todayKey() {
  const s = await getSettings();
  return dayKey(new Date(), s.timeZone, s.resetHour);
}

// ---------- habits ----------

export type HabitRow = typeof habits.$inferSelect;

export function toEngineHabit(h: HabitRow): Habit {
  return {
    id: h.id,
    name: h.name,
    stat: h.stat,
    target: h.target,
    unit: h.unit,
    schedule: h.schedule,
    grade: h.grade,
    startDay: h.startDay,
    archived: h.archived,
    minTarget: h.minTarget,
    mastered: h.masteredAt !== null,
    cue: h.cue,
    place: h.place,
    bundle: h.bundle,
    masteryName: h.masteryName,
    masteryTitle: h.masteryTitle,
  };
}

export interface HabitInput {
  name: string;
  stat: Stat;
  target: number;
  unit: string;
  grade: Grade;
  schedule: string;
  cue?: string;
  place?: string;
  bundle?: string;
  minTarget?: number | null;
}

export async function addHabits(list: HabitInput[]) {
  if (list.length === 0) return;
  const startDay = await todayKey();
  const existing = await db.select({ id: habits.id }).from(habits).where(isNull(habits.deletedAt));
  await db.insert(habits).values(
    list.map((h, i) => ({ id: uuidv7(), ...stamps(), ...h, sortOrder: existing.length + i, startDay })),
  );
}

export async function updateHabit(id: string, patch: Partial<HabitInput>) {
  await db.update(habits).set({ ...patch, ...touched() }).where(eq(habits.id, id));
}

/** Soft delete so the deletion can sync; closed days keep their frozen outcome. */
export async function deleteHabit(id: string) {
  await db.update(habits).set({ deletedAt: new Date(), ...touched() }).where(eq(habits.id, id));
}

export async function getHabit(id: string) {
  return db.query.habits.findFirst({ where: and(eq(habits.id, id), isNull(habits.deletedAt)) });
}

export const SAMPLE_HABITS: HabitInput[] = [
  { name: 'Push-ups', stat: 'STR', target: 100, unit: 'reps', grade: 'E', schedule: 'daily' },
  { name: 'Run', stat: 'AGI', target: 5, unit: 'km', grade: 'D', schedule: 'daily' },
  { name: 'Read', stat: 'INT', target: 20, unit: 'pages', grade: 'E', schedule: 'daily' },
  { name: 'Meditate', stat: 'SENSE', target: 10, unit: 'min', grade: 'E', schedule: 'daily' },
  { name: 'Sleep before 23:00', stat: 'STA', target: 1, unit: '', grade: 'E', schedule: 'daily' },
];

// ---------- logs ----------

/** Logs progress for today. A negative amount undoes progress. */
export async function logProgress(habitId: string, amount: number) {
  if (amount === 0) return;
  await db.insert(logs).values({ id: uuidv7(), ...stamps(), habitId, day: await todayKey(), amount });
}

// ---------- day close ----------

let closing: Promise<number> | null = null;

/**
 * Freezes every finished day that has no result yet. Safe to call often:
 * concurrent calls share one run and the unique day index prevents duplicates.
 * Returns how many days were closed.
 */
export function closePendingDays(): Promise<number> {
  closing ??= (async () => {
    try {
      const today = await todayKey();
      const habitRows = await db.select().from(habits).where(isNull(habits.deletedAt));
      const engineHabits = habitRows.map(toEngineHabit);
      const closed = await db.select({ day: dayResults.day }).from(dayResults);
      const pending = daysToClose(engineHabits, new Set(closed.map((r) => r.day)), today);
      if (pending.length === 0) return 0;

      const logRows = await db
        .select({ habitId: logs.habitId, day: logs.day, amount: logs.amount })
        .from(logs)
        .where(and(isNull(logs.deletedAt), inArray(logs.day, pending)));

      for (const day of pending) {
        const outcome = evaluateDay(engineHabits, logRows, day);
        const cleared = outcome.goals.filter((g) => g.done).length;
        const kept = outcome.goals.every((g) => g.done || g.min);
        const total = outcome.goals.length;
        await db
          .insert(dayResults)
          .values({
            id: uuidv7(),
            ...stamps(),
            day,
            cleared,
            total,
            outcomesJson: JSON.stringify(outcome.goals),
            // Only failures need the player's attention.
            acknowledged: total === 0 || kept,
          })
          .onConflictDoNothing();
      }
      return pending.length;
    } finally {
      closing = null;
    }
  })();
  return closing;
}

export async function acknowledgeDays(days: string[]) {
  if (days.length === 0) return;
  await db.update(dayResults).set({ acknowledged: true, ...touched() }).where(inArray(dayResults.day, days));
}

// ---------- store ----------

/** A treat bought with gold, or an unlock: a free permission once the Daily Quest is kept. */
export type RewardKind = 'treat' | 'unlock';

export async function addStoreItem(name: string, cost: number, kind: RewardKind = 'treat') {
  await db
    .insert(storeItems)
    .values({ id: uuidv7(), ...stamps(), name: name.trim(), cost: kind === 'unlock' ? 0 : Math.round(cost), kind });
}

export async function updateStoreItem(id: string, name: string, cost: number, kind: RewardKind = 'treat') {
  await db
    .update(storeItems)
    .set({ name: name.trim(), cost: kind === 'unlock' ? 0 : Math.round(cost), kind, ...touched() })
    .where(eq(storeItems.id, id));
}

export async function deleteStoreItem(id: string) {
  await db.update(storeItems).set({ deletedAt: new Date(), ...touched() }).where(eq(storeItems.id, id));
}

/**
 * Records a purchase. The caller checks the gold balance first; random boxes
 * are rolled here, once, and the result is stored so it never changes.
 */
export async function buy(
  item: { kind: 'treat'; storeItemId: string; cost: number } | { kind: SystemItemId },
): Promise<BoxResult | null> {
  const day = await todayKey();
  let result: BoxResult | null = null;
  let cost: number;
  let storeItemId = '';

  if (item.kind === 'treat') {
    cost = item.cost;
    storeItemId = item.storeItemId;
  } else {
    cost = SYSTEM_ITEMS[item.kind].cost;
    if (item.kind === 'blessed_box') {
      const treats = await db.select({ name: storeItems.name }).from(storeItems).where(isNull(storeItems.deletedAt));
      result = rollBlessedBox(treats.map((t) => t.name));
      if (!result) throw new Error('Add a reward to your list first.');
    } else if (item.kind === 'cursed_box') {
      result = rollCursedBox();
    }
  }

  await db.insert(purchases).values({
    id: uuidv7(),
    ...stamps(),
    storeItemId,
    cost,
    kind: item.kind,
    day,
    resultJson: result ? JSON.stringify(result) : null,
  });
  return result;
}

// ---------- status ----------

export async function allocatePoint(stat: Stat) {
  await db.insert(statAllocations).values({ id: uuidv7(), ...stamps(), stat, points: 1 });
}

export async function activateSkill(skill: SkillId) {
  await db.insert(skillUses).values({ id: uuidv7(), ...stamps(), skill, day: await todayKey() });
}

/** Undo today's use of a skill (refunds its MP, since the engine only counts live rows). */
export async function cancelSkillToday(skill: SkillId) {
  const day = await todayKey();
  await db
    .update(skillUses)
    .set({ deletedAt: new Date(), ...touched() })
    .where(and(eq(skillUses.skill, skill), eq(skillUses.day, day), isNull(skillUses.deletedAt)));
}

// ---------- penalty quest ----------

export async function setSurvival(day: string, quest: SurvivalQuest) {
  await db
    .update(dayResults)
    .set({ survivalStatus: JSON.stringify(quest), ...touched() })
    .where(eq(dayResults.day, day));
}

// ---------- behaviour design ----------

async function addEvent(kind: string, ref: string, data?: unknown) {
  await db.insert(events).values({
    id: uuidv7(),
    ...stamps(),
    kind,
    ref,
    day: await todayKey(),
    dataJson: data === undefined ? null : JSON.stringify(data),
  });
}

/** Marks a one-time notice (season recap, daily report, re-plan) as seen. */
export function markSeen(ref: string) {
  return addEvent('seen', ref);
}

/** Records the answer to an upgrade/downgrade/mastery offer so it isn't repeated too soon. */
export function recordDecision(habitId: string, kind: OfferKind, accepted: boolean) {
  return addEvent('offer', habitId, { kind, accepted });
}

export async function submitCheckin(habitId: string, scores: number[]) {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  await db.insert(checkins).values({ id: uuidv7(), ...stamps(), habitId, day: await todayKey(), scoresJson: JSON.stringify(scores), avg });
}

/** Answers today's Urgent Quest: cleared or skipped (skipping never costs anything). */
export async function answerUrgent(day: string, challengeId: string, outcome: 'done' | 'skipped') {
  await addEvent('urgent', day, { challengeId, outcome });
}

/** Turns a quest into a Passive Skill. */
export async function acceptMastery(habitId: string, skillName: string, identityTitle: string) {
  await db
    .update(habits)
    .set({ masteredAt: new Date(), masteryName: skillName.trim(), masteryTitle: identityTitle.trim(), ...touched() })
    .where(eq(habits.id, habitId));
  await recordDecision(habitId, 'mastery', true);
}

export async function acceptOffer(offer: QuestOffer) {
  await updateHabit(offer.habitId, {
    target: offer.toTarget,
    ...(offer.suggestMin ? { minTarget: offer.suggestMin } : {}),
  });
  if (offer.kind === 'up') {
    const h = await getHabit(offer.habitId);
    const next = h ? GRADES[Math.min(GRADES.length - 1, GRADES.indexOf(h.grade) + 1)] : undefined;
    if (next) await updateHabit(offer.habitId, { grade: next });
  }
  await recordDecision(offer.habitId, offer.kind, true);
}

// ---------- Overgeared layer ----------

export async function equipItem(slot: Slot, itemId: string) {
  await addEvent('equip', slot, { itemId });
}

/** Equips a title (display) and records when, so its effect starts today, not retroactively. */
export async function setTitle(title: string) {
  await updateSettings({ title });
  await addEvent('title', title);
}

export async function startJobTrial() {
  await addEvent('job_trial', 'start');
}

export async function chooseJob(jobId: string) {
  await addEvent('job', jobId);
}

// ---------- Main Quests ----------

function questValues(name: string, data: MainQuestData) {
  const current = currentChapter(data);
  return {
    name: name.trim(),
    rating: '',
    stepsJson: JSON.stringify(data),
    currentStep: current,
    status: current >= data.chapters.length && data.chapters.length > 0 ? ('cleared' as const) : ('active' as const),
  };
}

export async function saveMainQuest(id: string | null, name: string, data: MainQuestData) {
  if (id) {
    await db.update(classQuests).set({ ...questValues(name, data), ...touched() }).where(eq(classQuests.id, id));
  } else {
    await db.insert(classQuests).values({ id: uuidv7(), ...stamps(), ...questValues(name, data) });
  }
}

export async function deleteMainQuest(id: string) {
  await db.update(classQuests).set({ deletedAt: new Date(), ...touched() }).where(eq(classQuests.id, id));
}

/**
 * Progress on one quest of a Main Quest: "advance" adds one to a counted quest or
 * clears it today; "undo" reopens a cleared quest or takes one count off. A note
 * ("what I learned") can be saved with a clear.
 */
export async function updateQuestTask(
  id: string,
  name: string,
  data: MainQuestData,
  ci: number,
  ti: number,
  op: 'advance' | 'undo',
  note?: string,
) {
  const next: MainQuestData = { ...data, chapters: data.chapters.map((c) => ({ ...c, tasks: c.tasks.map((t) => ({ ...t })) })) };
  const t = next.chapters[ci]?.tasks[ti];
  if (!t) return;
  if (op === 'advance') {
    if (t.doneDay) return;
    if (t.target && t.target > 1) {
      t.count = (t.count ?? 0) + 1;
      if (t.count >= t.target) t.doneDay = await todayKey();
    } else {
      t.doneDay = await todayKey();
    }
    if (note?.trim()) t.note = note.trim();
  } else if (t.doneDay) {
    t.doneDay = null;
    if (t.target && t.target > 1) t.count = t.target - 1;
  } else if ((t.count ?? 0) > 0) {
    t.count = (t.count ?? 0) - 1;
  }
  await db.update(classQuests).set({ ...questValues(name, next), ...touched() }).where(eq(classQuests.id, id));
}

// ---------- rewards ----------

/** Forges three same-rarity items into one of the next rarity (checked by the engine). */
export async function forgeItems(inputs: string[]) {
  await addEvent('forge', 'forge', { inputs });
}

/** Starts economy v2 (gold per kept day) today, once. Earlier days keep their gold. */
export async function ensureEconomyV2() {
  const existing = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.kind, 'economy'), isNull(events.deletedAt)))
    .limit(1);
  if (existing.length === 0) await addEvent('economy', 'v2');
}

// ---------- dev tools ----------

/**
 * Dev only: moves every habit's start one day earlier, so yesterday becomes a
 * day with goals and no logs. The next day close turns it into a failure.
 */
export async function devSimulateMissedDay() {
  const rows = await db.select().from(habits).where(isNull(habits.deletedAt));
  const closed = await db.select({ day: dayResults.day }).from(dayResults);
  const earliestClosed = closed.reduce<string | null>((min, r) => (min === null || r.day < min ? r.day : min), null);
  for (const h of rows) {
    let start = addDays(h.startDay, -1);
    // Never reach into days that already closed.
    if (earliestClosed && start <= earliestClosed) start = addDays(earliestClosed, -1);
    await db.update(habits).set({ startDay: start, ...touched() }).where(eq(habits.id, h.id));
  }
  await closePendingDays();
}

// ---------- live queries ----------

export function habitsQuery() {
  return db.select().from(habits).where(isNull(habits.deletedAt)).orderBy(asc(habits.sortOrder));
}

export function logsQuery() {
  return db.select().from(logs).where(isNull(logs.deletedAt));
}

export function settingsQuery() {
  return db.select().from(settings).where(eq(settings.id, SETTINGS_ID));
}

export function storeItemsQuery() {
  return db.select().from(storeItems).where(isNull(storeItems.deletedAt)).orderBy(asc(storeItems.cost));
}

export function purchasesQuery() {
  return db.select().from(purchases).where(isNull(purchases.deletedAt));
}

export function skillUsesQuery() {
  return db.select().from(skillUses).where(isNull(skillUses.deletedAt));
}

export function allocationsQuery() {
  return db.select().from(statAllocations).where(isNull(statAllocations.deletedAt));
}

export function checkinsQuery() {
  return db.select().from(checkins).where(isNull(checkins.deletedAt));
}

export function classQuestsQuery() {
  return db.select().from(classQuests).where(isNull(classQuests.deletedAt)).orderBy(asc(classQuests.createdAt));
}

export function eventsQuery() {
  return db.select().from(events).where(isNull(events.deletedAt));
}

export function dayResultsQuery() {
  return db.select().from(dayResults).where(isNull(dayResults.deletedAt));
}

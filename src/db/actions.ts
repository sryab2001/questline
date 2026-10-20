import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { addDays, dayKey, daysToClose, evaluateDay, type Grade, type Habit, type Stat } from '@/engine';
import { uuidv7 } from '@/lib/uuid';

import { db } from './client';
import { dayResults, habits, logs, settings } from './schema';

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

/** Creates the single settings row on first launch. */
export async function ensureSettings() {
  await db
    .insert(settings)
    .values({ id: SETTINGS_ID, ...stamps(), playerName: 'Hunter', timeZone: deviceTimeZone(), resetHour: 0 })
    .onConflictDoNothing();
}

export async function getSettings() {
  const row = await db.query.settings.findFirst({ where: eq(settings.id, SETTINGS_ID) });
  if (!row) throw new Error('Settings missing; ensureSettings() must run first');
  return row;
}

export type SettingsPatch = Partial<
  Pick<typeof settings.$inferInsert, 'playerName' | 'resetHour' | 'morningHour' | 'warningHour' | 'lastSeenLevel' | 'timeZone'>
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
  };
}

export interface HabitInput {
  name: string;
  stat: Stat;
  target: number;
  unit: string;
  grade: Grade;
  schedule: string;
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
            acknowledged: total === 0 || cleared === total,
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

export function dayResultsQuery() {
  return db.select().from(dayResults).where(isNull(dayResults.deletedAt));
}

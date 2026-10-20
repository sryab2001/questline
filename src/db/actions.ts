import { asc, eq, isNull } from 'drizzle-orm';

import { dayKey, type Grade, type Stat } from '@/engine';
import { uuidv7 } from '@/lib/uuid';

import { db } from './client';
import { habits, logs, settings } from './schema';

const SETTINGS_ID = 'settings';

function stamps() {
  const now = new Date();
  return { createdAt: now, updatedAt: now, dirty: true };
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

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

export async function todayKey() {
  const s = await getSettings();
  return dayKey(new Date(), s.timeZone, s.resetHour);
}

export interface NewHabit {
  name: string;
  stat: Stat;
  target: number;
  unit: string;
  grade?: Grade;
  schedule?: string;
}

export async function addHabits(list: NewHabit[]) {
  const startDay = await todayKey();
  const existing = await db.select({ id: habits.id }).from(habits).where(isNull(habits.deletedAt));
  await db.insert(habits).values(
    list.map((h, i) => ({
      id: uuidv7(),
      ...stamps(),
      name: h.name,
      stat: h.stat,
      target: h.target,
      unit: h.unit,
      grade: h.grade ?? 'E',
      schedule: h.schedule ?? 'daily',
      sortOrder: existing.length + i,
      startDay,
    })),
  );
}

export const SAMPLE_HABITS: NewHabit[] = [
  { name: 'Push-ups', stat: 'STR', target: 100, unit: 'reps' },
  { name: 'Run', stat: 'AGI', target: 5, unit: 'km', grade: 'D' },
  { name: 'Read', stat: 'INT', target: 20, unit: 'pages' },
  { name: 'Meditate', stat: 'SENSE', target: 10, unit: 'min' },
  { name: 'Sleep before 23:00', stat: 'STA', target: 1, unit: '' },
];

/** Logs progress for today. A negative amount undoes progress. */
export async function logProgress(habitId: string, amount: number) {
  await db.insert(logs).values({ id: uuidv7(), ...stamps(), habitId, day: await todayKey(), amount });
}

export function habitsQuery() {
  return db.select().from(habits).where(isNull(habits.deletedAt)).orderBy(asc(habits.sortOrder));
}

export function logsQuery() {
  return db.select().from(logs).where(isNull(logs.deletedAt));
}

export function settingsQuery() {
  return db.select().from(settings).where(eq(settings.id, SETTINGS_ID));
}

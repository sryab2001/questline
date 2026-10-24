// Instance Dungeon: a focus timer for time-based quests. State lives in the meta
// store as wall-clock times, so the timer survives leaving or closing the app;
// whatever reopens the app after the end time claims the minutes.
import * as Notifications from 'expo-notifications';

import { logProgress } from '@/db/actions';
import { readMeta, writeMeta } from '@/db/client';
import { QUIET_CHANNEL } from '@/quick/today';

const KEY = 'dungeon';
/** Reminder sync reschedules everything except notifications with this prefix. */
export const DUNGEON_NOTIFICATION_PREFIX = 'dungeon-';
const SYSTEM_CHANNEL = 'system';

export interface ActiveDungeon {
  habitId: string;
  habitName: string;
  unit: string;
  minutes: number;
  startedAt: number;
  endsAt: number;
  notificationIds: string[];
}

const MINUTE_UNITS = /^(m|min|mins|minute|minutes)$/i;
const HOUR_UNITS = /^(h|hr|hrs|hour|hours)$/i;

/** Quests measured in time can be run as a Dungeon. */
export const isTimeUnit = (unit: string) => MINUTE_UNITS.test(unit.trim()) || HOUR_UNITS.test(unit.trim());

/** Minutes → the quest's own unit (minutes or hours). */
const toUnit = (minutes: number, unit: string) => (HOUR_UNITS.test(unit.trim()) ? Math.round((minutes / 60) * 100) / 100 : minutes);

export function readDungeon(): ActiveDungeon | null {
  try {
    const raw = readMeta(KEY);
    return raw ? (JSON.parse(raw) as ActiveDungeon) : null;
  } catch {
    return null;
  }
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export async function enterDungeon(habit: { id: string; name: string; unit: string }, minutes: number) {
  const startedAt = Date.now();
  const endsAt = startedAt + minutes * 60_000;
  const ids: string[] = [];
  try {
    // An ongoing notice while inside, and the "cleared" call at the end.
    ids.push(
      await Notifications.scheduleNotificationAsync({
        identifier: `${DUNGEON_NOTIFICATION_PREFIX}ongoing`,
        content: { title: '[INSTANCE DUNGEON]', body: `${habit.name} · ${minutes} min · ends ${clock(endsAt)}`, sticky: true, autoDismiss: false },
        trigger: { channelId: QUIET_CHANNEL },
      }),
    );
    ids.push(
      await Notifications.scheduleNotificationAsync({
        identifier: `${DUNGEON_NOTIFICATION_PREFIX}end`,
        content: { title: '[DUNGEON CLEARED]', body: `${habit.name}: ${minutes} minutes complete. Open to claim your rewards.` },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt), channelId: SYSTEM_CHANNEL },
      }),
    );
  } catch {
    // Notifications are a convenience; the timer works without them.
  }
  const d: ActiveDungeon = { habitId: habit.id, habitName: habit.name, unit: habit.unit, minutes, startedAt, endsAt, notificationIds: ids };
  writeMeta(KEY, JSON.stringify(d));
  return d;
}

async function close(d: ActiveDungeon, keepEndNotice: boolean) {
  writeMeta(KEY, '');
  const [ongoing, end] = d.notificationIds;
  if (ongoing) await Notifications.dismissNotificationAsync(ongoing).catch(() => {});
  if (end && !keepEndNotice) await Notifications.cancelScheduledNotificationAsync(end).catch(() => {});
}

/**
 * Leaves the Dungeon and logs the time spent: the full planned minutes once the
 * end time has passed, otherwise the whole minutes so far. Returns minutes logged.
 */
export async function leaveDungeon(): Promise<number> {
  const d = readDungeon();
  if (!d) return 0;
  const finished = Date.now() >= d.endsAt;
  const minutes = finished ? d.minutes : Math.floor((Date.now() - d.startedAt) / 60_000);
  await close(d, finished);
  if (minutes > 0) await logProgress(d.habitId, toUnit(minutes, d.unit));
  return minutes;
}

/** Leaves without logging anything. */
export async function abandonDungeon() {
  const d = readDungeon();
  if (d) await close(d, false);
}

/** On app start or return: a Dungeon whose time ran out pays out. Returns it if claimed. */
export async function claimFinishedDungeon(): Promise<ActiveDungeon | null> {
  const d = readDungeon();
  if (!d || Date.now() < d.endsAt) return null;
  await leaveDungeon();
  return d;
}

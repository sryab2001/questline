// Quick actions from outside the app: the home-screen widget and notification
// buttons. These run headless (no React tree), straight against the database.
import { and, eq, isNull } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';

import { answerUrgent, logProgress, todayKey, toEngineHabit } from '@/db/actions';
import { currentWorld, db, readMeta, writeMeta } from '@/db/client';
import { habits, logs } from '@/db/schema';
import { type DayKey, isScheduled, progressFor } from '@/engine';

export interface QuickGoal {
  habitId: string;
  name: string;
  unit: string;
  progress: number;
  target: number;
  done: boolean;
  /** At the Minimum Clear but not the full target. */
  min: boolean;
  /** Screen-time Limit Quest: progress is usage, done means under the limit, never tapped. */
  limit: boolean;
}

/** What the app last knew beyond today's goals (level, streak), for the widget header. */
export interface PlayerSnapshot {
  day: DayKey;
  level: number;
  streak: number;
  test: boolean;
}

const SNAPSHOT_KEY = 'widget_snapshot';

export function saveSnapshot(s: PlayerSnapshot) {
  writeMeta(SNAPSHOT_KEY, JSON.stringify(s));
}

export function readSnapshot(): PlayerSnapshot | null {
  try {
    const raw = readMeta(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as PlayerSnapshot) : null;
  } catch {
    return null;
  }
}

/** Today's scheduled quests and their progress, read fresh from the database. */
export async function loadTodayGoals(): Promise<{ today: DayKey; goals: QuickGoal[] }> {
  const today = await todayKey();
  const rows = await db.select().from(habits).where(isNull(habits.deletedAt));
  const todays = rows
    .map(toEngineHabit)
    .filter((h) => isScheduled(h, today))
    .sort((a, b) => (rows.find((r) => r.id === a.id)?.sortOrder ?? 0) - (rows.find((r) => r.id === b.id)?.sortOrder ?? 0));
  const logRows = await db
    .select({ habitId: logs.habitId, day: logs.day, amount: logs.amount })
    .from(logs)
    .where(and(eq(logs.day, today), isNull(logs.deletedAt)));
  const goals = todays.map((h) => {
    const progress = progressFor(logRows, h.id, today);
    const done = h.limit ? progress <= h.target : progress >= h.target;
    return {
      habitId: h.id,
      name: h.name,
      unit: h.unit,
      progress,
      target: h.target,
      done,
      min: !h.limit && !done && !!h.minTarget && progress >= h.minTarget,
      limit: !!h.limit,
    };
  });
  return { today, goals };
}

/**
 * Clears one of today's quests by logging whatever is left of its target.
 * Safe to repeat: a quest that's already done gets nothing more.
 */
export async function markGoalDone(habitId: string): Promise<{ name: string; left: number } | null> {
  const { goals } = await loadTodayGoals();
  const goal = goals.find((g) => g.habitId === habitId);
  if (!goal || goal.limit) return null;
  if (!goal.done) await logProgress(habitId, goal.target - goal.progress);
  const left = goals.filter((g) => g.habitId !== habitId && !g.limit && !g.done && !g.min).length;
  return { name: goal.name, left };
}

export const DAILY_CATEGORY = 'dailyquest';
export const URGENT_CATEGORY = 'urgentquest';
export const QUIET_CHANNEL = 'quiet';
export const DONE_ACTION_PREFIX = 'done:';
export const URGENT_DONE_ACTION = 'urgent_done';

/** Identifier of the evening warning for a local date, so it can be cancelled once the day is kept. */
export const warningId = (day: DayKey) => `warning-${day}`;

/**
 * Handles a notification button: "✓ <quest>" clears that quest, "✓ DONE" clears
 * today's Urgent Quest. Works from the background task and in the foreground.
 */
export async function handleNotificationAction(response: {
  actionIdentifier?: string;
  notification?: { request?: { identifier?: string; content?: { data?: Record<string, unknown> } } };
}) {
  const action = response.actionIdentifier ?? '';
  const notificationId = response.notification?.request?.identifier;
  let message: string | null = null;

  if (action.startsWith(DONE_ACTION_PREFIX)) {
    const result = await markGoalDone(action.slice(DONE_ACTION_PREFIX.length));
    if (result) {
      message = result.left === 0 ? 'Daily Quest complete. Rewards received.' : `${result.name} cleared. ${result.left} left.`;
      if (result.left === 0) {
        const { today } = await loadTodayGoals();
        await Notifications.cancelScheduledNotificationAsync(warningId(today)).catch(() => {});
      }
    }
  } else if (action === URGENT_DONE_ACTION) {
    const data = response.notification?.request?.content?.data ?? {};
    if (typeof data.day === 'string' && typeof data.challengeId === 'string') {
      await answerUrgent(data.day, data.challengeId, 'done');
      message = 'Urgent Quest cleared. Bonus received.';
    }
  } else {
    return;
  }

  if (notificationId) await Notifications.dismissNotificationAsync(notificationId).catch(() => {});
  if (message) {
    await Notifications.scheduleNotificationAsync({
      content: { title: currentWorld() === 'test' ? '[System · Test World]' : '[System]', body: message },
      trigger: { channelId: QUIET_CHANNEL },
    }).catch(() => {});
  }
  // Imported lazily: the widget module pulls in the widget renderer.
  const { refreshWidget } = await import('@/widget/refresh');
  await refreshWidget();
}

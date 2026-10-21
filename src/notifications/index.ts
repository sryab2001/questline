import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { NOTIFICATION_TASK } from '@/background';
import {
  DAILY_CATEGORY,
  DONE_ACTION_PREFIX,
  QUIET_CHANNEL,
  URGENT_CATEGORY,
  URGENT_DONE_ACTION,
  warningId,
} from '@/quick/today';

const CHANNEL_ID = 'system';
/** Warnings are scheduled this many days ahead, in case the app isn't opened. */
const WARNING_DAYS_AHEAD = 7;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let setupDone: Promise<boolean> | null = null;

/** Creates the Android channel and asks for permission once. Resolves to whether we may notify. */
export function setupNotifications(): Promise<boolean> {
  setupDone ??= (async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'System messages',
        description: 'Daily Quest arrivals and penalty warnings',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#5cd0ff',
        vibrationPattern: [0, 120, 80, 120],
      });
      // Confirmations after a notification or widget button ("Push-ups cleared"): no sound.
      await Notifications.setNotificationChannelAsync(QUIET_CHANNEL, {
        name: 'Confirmations',
        description: 'Quiet notes after clearing a quest from a notification',
        importance: Notifications.AndroidImportance.LOW,
      });
      // Notification buttons run here when the app is in the background or closed.
      await Notifications.registerTaskAsync(NOTIFICATION_TASK).catch(() => {});
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  })();
  return setupDone;
}

export async function notificationPermission() {
  return (await Notifications.getPermissionsAsync()).granted;
}

export interface ReminderPlan {
  morningHour: number;
  warningHour: number;
  /** Goals scheduled today and how many are cleared. */
  todayTotal: number;
  todayCleared: number;
  /** Whether a goal exists at all; with none there is nothing to remind about. */
  hasHabits: boolean;
  /** Rest Day is active: no warning today. */
  restedToday: boolean;
  /** End of a running penalty quest (ms), if any. */
  survivalDeadline: number | null;
  /** Trigger lines for today's unfinished quests, e.g. "After brushing teeth → Push-ups". */
  cues: string[];
  /** The last missed day was a Slip: missing today makes it a Failure. */
  streakAtRisk: boolean;
  /** Upcoming Urgent Quests: when each appears and what it asks. */
  urgent: { at: number; text: string; day: string; challengeId: string }[];
  /** Quests to offer as "✓" buttons (unfinished first); Android shows at most three. */
  quick: { habitId: string; name: string }[];
}

/** YYYY-MM-DD of a Date on the phone's clock. */
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Replaces every scheduled reminder with a fresh set built from the current state. */
export async function syncReminders(plan: ReminderPlan, now = new Date()) {
  if (!(await setupNotifications())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!plan.hasHabits) return;

  // "✓ Push-ups" buttons: clear a quest straight from the notification.
  const buttons = plan.quick.slice(0, 3).map((q) => ({
    identifier: `${DONE_ACTION_PREFIX}${q.habitId}`,
    buttonTitle: `✓ ${q.name}`,
    options: { opensAppToForeground: false },
  }));
  if (buttons.length > 0) await Notifications.setNotificationCategoryAsync(DAILY_CATEGORY, buttons);
  await Notifications.setNotificationCategoryAsync(URGENT_CATEGORY, [
    { identifier: URGENT_DONE_ACTION, buttonTitle: '✓ DONE', options: { opensAppToForeground: false } },
  ]);
  const category = buttons.length > 0 ? DAILY_CATEGORY : undefined;

  await Notifications.scheduleNotificationAsync({
    content: {
      categoryIdentifier: category,
      title: '[Daily Quest has arrived]',
      body: plan.cues.length
        ? plan.cues.slice(0, 3).join(' · ')
        : 'Preparation to Become Powerful. Your goals await, Player.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: plan.morningHour,
      minute: 0,
      channelId: CHANNEL_ID,
    },
  });

  const remaining = plan.todayTotal - plan.todayCleared;
  for (let i = 0; i < WARNING_DAYS_AHEAD; i++) {
    const at = new Date(now);
    at.setDate(at.getDate() + i);
    at.setHours(plan.warningHour, 0, 0, 0);
    if (at <= now) continue;
    if (i === 0 && (plan.todayTotal === 0 || remaining === 0 || plan.restedToday)) continue;

    await Notifications.scheduleNotificationAsync({
      // Named by date so clearing the last quest from a button can cancel it.
      identifier: warningId(localDay(at)),
      content: {
        categoryIdentifier: category,
        title: 'WARNING',
        body:
          i === 0
            ? plan.streakAtRisk
              ? `${remaining} goal${remaining === 1 ? '' : 's'} remain. You slipped once. Do not miss twice.`
              : `${remaining} goal${remaining === 1 ? '' : 's'} remain. A minimum clear still keeps your streak.`
            : 'The Daily Quest is not complete. Failure will result in a penalty.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
    });
  }

  // Urgent Quests: one notification when each appears (they are optional; no follow-ups).
  for (const u of plan.urgent) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '[URGENT QUEST]',
        body: `${u.text}. Optional: bonus EXP, gold and a chance of loot.`,
        categoryIdentifier: URGENT_CATEGORY,
        data: { day: u.day, challengeId: u.challengeId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(u.at), channelId: CHANNEL_ID },
    });
  }

  // Penalty quest: warn 30 minutes before time runs out.
  const survivalWarnAt = plan.survivalDeadline ? plan.survivalDeadline - 30 * 60_000 : 0;
  if (survivalWarnAt > now.getTime()) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'PENALTY QUEST: SURVIVAL', body: '30 minutes remain. Clear your goals or take the full penalty.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(survivalWarnAt), channelId: CHANNEL_ID },
    });
  }
}

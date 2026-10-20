import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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
}

/** Replaces every scheduled reminder with a fresh set built from the current state. */
export async function syncReminders(plan: ReminderPlan, now = new Date()) {
  if (!(await setupNotifications())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!plan.hasHabits) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '[Daily Quest has arrived]',
      body: 'Preparation to Become Powerful. Your goals await, Player.',
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
      content: {
        title: 'WARNING',
        body:
          i === 0
            ? `${remaining} goal${remaining === 1 ? '' : 's'} remain. Failure to complete the Daily Quest will result in a penalty.`
            : 'The Daily Quest is not complete. Failure will result in a penalty.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
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

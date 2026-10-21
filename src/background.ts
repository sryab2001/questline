// Background work that must be registered before the app renders: notification
// button presses arrive here when the app is in the background or closed.
import type * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { handleNotificationAction } from '@/quick/today';

export const NOTIFICATION_TASK = 'questline-notification-task';

TaskManager.defineTask<Notifications.NotificationTaskPayload>(NOTIFICATION_TASK, async ({ data, error }) => {
  if (error || !data || !('actionIdentifier' in data)) return;
  await handleNotificationAction(data as Parameters<typeof handleNotificationAction>[0]);
});

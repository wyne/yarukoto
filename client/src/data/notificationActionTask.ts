import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COMPLETE_ACTION_ID,
  PendingNotificationAction,
  SNOOZE_ACTION_ID,
  SNOOZE_DURATION_MS,
  TASK_REMINDER_CATEGORY_ID,
  appendStoredPendingAction,
  taskSnoozeNotificationIdentifier,
} from './notificationActions';
import { parseTaskReminderNotificationData } from './taskReminderNotifications';

export const NOTIFICATION_ACTION_TASK = 'yarukoto-notification-action';

/**
 * Android's answer to the killed-app problem, and the counterpart to
 * modules/notification-actions on iOS.
 *
 * Expo runs this task for a notification action tap even when the app is
 * terminated — the one platform where that is documented to work — by starting a
 * headless JS context. That context has no React tree and no primed storage
 * cache, so everything here talks to AsyncStorage and `fetch` directly and
 * leaves the result for the app to fold in on next launch.
 *
 * Must be defined in module scope of a file the bundle requires early; see
 * index.ts.
 */
export function defineNotificationActionTask(): void {
  if (TaskManager.isTaskDefined(NOTIFICATION_ACTION_TASK)) return;

  TaskManager.defineTask<Notifications.NotificationTaskPayload>(NOTIFICATION_ACTION_TASK, async ({ data }) => {
    if (!data || !('actionIdentifier' in data)) return;
    const response = data as Notifications.NotificationResponse;
    const action = response.actionIdentifier;
    if (action !== COMPLETE_ACTION_ID && action !== SNOOZE_ACTION_ID) return;

    const content = response.notification?.request?.content;
    const reminder = parseTaskReminderNotificationData(content?.data as Record<string, unknown> | undefined);
    if (!reminder) return;

    const at = new Date().toISOString();

    if (action === SNOOZE_ACTION_ID) {
      const fireAt = new Date(Date.now() + SNOOZE_DURATION_MS);
      await scheduleSnooze(content, reminder.taskId, reminder.reminderId, fireAt);
      await appendStoredPendingAction({
        action: SNOOZE_ACTION_ID,
        taskId: reminder.taskId,
        reminderId: reminder.reminderId,
        at,
        fireAt: fireAt.toISOString(),
      });
      return;
    }

    // Queued either way. The app applies it locally and lets its own outbox
    // carry it, which is both the fallback when this push failed and a harmless
    // repeat when it did not — the server's last-write-wins makes an identical
    // row a no-op.
    await appendStoredPendingAction({
      action: COMPLETE_ACTION_ID,
      taskId: reminder.taskId,
      reminderId: reminder.reminderId,
      at,
    });
    await pushCompletion(reminder.taskId, at);
  });
}

async function scheduleSnooze(
  content: Notifications.NotificationContent | undefined,
  taskId: string,
  reminderId: string,
  fireAt: Date
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: taskSnoozeNotificationIdentifier(taskId, reminderId),
      content: {
        title: content?.title ?? 'Task reminder',
        body: content?.body ?? '',
        sound: 'default',
        // Kept so a snoozed reminder still offers both buttons.
        categoryIdentifier: TASK_REMINDER_CATEGORY_ID,
        data: { ...(content?.data ?? {}), fireAt: fireAt.toISOString() },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
  } catch {
    // A snooze that cannot be rescheduled is a lost reminder, not lost data. The
    // queue entry below still records that the user asked for one.
  }
}

/**
 * Posts to the same narrow endpoint iOS uses.
 *
 * The headless context does hold the real sync client, so this could go through
 * `pushDirty` instead. It deliberately does not: that would put a second
 * orchestrator on the wire, racing the foreground app's sync loop and having to
 * reproduce its outbox and feature negotiation. One task id and a timestamp
 * cannot strip a field or clobber a row.
 */
async function pushCompletion(taskId: string, completedAt: string): Promise<void> {
  try {
    const [serverUrl, token] = await Promise.all([
      AsyncStorage.getItem('yarukoto.serverUrl'),
      AsyncStorage.getItem('yarukoto.token'),
    ]);
    if (!serverUrl || !token) return;

    const base = serverUrl.replace(/\/+$/, '');
    await fetch(`${base}/api/v1/tasks/${encodeURIComponent(taskId)}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedAt }),
    });
  } catch {
    // Offline, or a server too old to know this endpoint. Either way the queued
    // entry above is what makes the tap survive.
  }
}

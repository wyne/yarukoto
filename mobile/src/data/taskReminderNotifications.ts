import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { addDays, formatDueFull, fromISODate } from './dateUtils';
import { normalizeReminders } from './reminders';
import {
  COMPLETE_ACTION_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_DURATION_MS,
  SnoozedReminder,
  TASK_REMINDER_CATEGORY_ID,
  TASK_SNOOZE_NOTIFICATION_PREFIX,
  taskSnoozeNotificationIdentifier,
} from './notificationActions';
import type { Task, TaskReminder } from './types';

export const TASK_REMINDER_NOTIFICATION_PREFIX = 'yarukoto:taskReminder:';
export const TASK_REMINDER_CHANNEL_ID = 'task-reminders';
export const MAX_SCHEDULED_TASK_REMINDERS = 60;

const FINGERPRINT_KEY = 'yarukotoReminderFingerprint';

export interface TaskReminderNotificationData {
  kind: 'taskReminder';
  taskId: string;
  reminderId: string;
  fireAt: string;
}

export interface TaskReminderNotificationRequest {
  identifier: string;
  taskId: string;
  reminderId: string;
  fireAt: Date;
  fingerprint: string;
  request: Notifications.NotificationRequestInput;
}

export function taskReminderNotificationIdentifier(taskId: string, reminderId: string): string {
  return `${TASK_REMINDER_NOTIFICATION_PREFIX}${taskId}:${reminderId}`;
}

export function taskReminderFireDate(
  task: Pick<Task, 'dueDate'>,
  reminder: Pick<TaskReminder, 'offsetDays' | 'time'>
): Date | null {
  if (!task.dueDate) return null;
  const [hour, minute] = reminder.time.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const fireAt = addDays(fromISODate(task.dueDate), -reminder.offsetDays);
  fireAt.setHours(hour, minute, 0, 0);
  return Number.isNaN(fireAt.getTime()) ? null : fireAt;
}

export function parseTaskReminderNotificationData(
  data: Record<string, unknown> | undefined
): TaskReminderNotificationData | null {
  if (
    data?.kind !== 'taskReminder' ||
    typeof data.taskId !== 'string' ||
    typeof data.reminderId !== 'string' ||
    typeof data.fireAt !== 'string'
  ) {
    return null;
  }
  return {
    kind: 'taskReminder',
    taskId: data.taskId,
    reminderId: data.reminderId,
    fireAt: data.fireAt,
  };
}

function titleForTask(task: Pick<Task, 'title'>): string {
  return task.title.trim() || 'Task reminder';
}

function fingerprintFor(title: string, body: string, fireAt: Date): string {
  return JSON.stringify({
    title,
    body,
    fireAt: fireAt.getTime(),
  });
}

/**
 * One request, whether it came from a task's reminder or from a snooze. Sharing
 * the shape is what lets a single reconciler own both — see below for why that
 * matters.
 */
function buildRequest(
  identifier: string,
  task: Task,
  reminderId: string,
  fireAt: Date
): TaskReminderNotificationRequest {
  const title = titleForTask(task);
  const body = `Due ${formatDueFull(task.dueDate, task.dueTime)}`;
  const data: TaskReminderNotificationData = {
    kind: 'taskReminder',
    taskId: task.id,
    reminderId,
    fireAt: fireAt.toISOString(),
  };
  const fingerprint = fingerprintFor(title, body, fireAt);

  return {
    identifier,
    taskId: task.id,
    reminderId,
    fireAt,
    fingerprint,
    request: {
      identifier,
      content: {
        title,
        body,
        sound: 'default',
        // Without this the notification has no action buttons at all: iOS and
        // Android both look the category up by id at *delivery* time, so it has
        // to be registered before then — see ensureNotificationCategories.
        categoryIdentifier: TASK_REMINDER_CATEGORY_ID,
        data: {
          ...data,
          [FINGERPRINT_KEY]: fingerprint,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: TASK_REMINDER_CHANNEL_ID,
      },
    },
  };
}

/**
 * Everything that should be scheduled right now, from both sources.
 *
 * Snoozes are included rather than scheduled off to the side because the
 * reconciler cancels any notification under a prefix it owns that it cannot
 * account for. Two authorities over one queue would mean each cancelling the
 * other's work; one authority over two prefixes is the arrangement that holds.
 *
 * The consequence to respect: a snooze that JS does not yet know about — one
 * taken natively while the app was killed — looks exactly like a stale
 * notification here. That is why the scheduler drains pending native actions
 * *before* it reconciles, never alongside.
 */
export function buildTaskReminderNotificationRequests(
  tasks: Task[],
  snoozes: SnoozedReminder[] = [],
  now = new Date()
): TaskReminderNotificationRequest[] {
  const nowMs = now.getTime();
  const requests: TaskReminderNotificationRequest[] = [];
  const byId = new Map(tasks.map((task) => [task.id, task]));

  for (const task of tasks) {
    if (task.completed || task.deletedAt || !task.dueDate) continue;
    for (const reminder of normalizeReminders(task.reminders)) {
      const fireAt = taskReminderFireDate(task, reminder);
      if (!fireAt || fireAt.getTime() <= nowMs) continue;
      requests.push(
        buildRequest(taskReminderNotificationIdentifier(task.id, reminder.id), task, reminder.id, fireAt)
      );
    }
  }

  for (const snooze of snoozes) {
    const task = byId.get(snooze.taskId);
    // A task finished or binned since the snooze was taken should not come back
    // an hour later to ask about itself.
    if (!task || task.completed || task.deletedAt) continue;
    const fireAt = new Date(snooze.fireAt);
    if (Number.isNaN(fireAt.getTime()) || fireAt.getTime() <= nowMs) continue;
    requests.push(
      buildRequest(taskSnoozeNotificationIdentifier(snooze.taskId, snooze.reminderId), task, snooze.reminderId, fireAt)
    );
  }

  // Sorting by fire time before the cap is what keeps a snooze — always imminent
  // — from being crowded out by reminders for next month.
  return requests
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.identifier.localeCompare(b.identifier))
    .slice(0, MAX_SCHEDULED_TASK_REMINDERS);
}

/** The notifications this reconciler is responsible for, and may cancel. */
function ownsIdentifier(identifier: string): boolean {
  return (
    identifier.startsWith(TASK_REMINDER_NOTIFICATION_PREFIX) ||
    identifier.startsWith(TASK_SNOOZE_NOTIFICATION_PREFIX)
  );
}

function scheduledFingerprint(request: Notifications.NotificationRequest): string | null {
  const value = request.content.data?.[FINGERPRINT_KEY];
  return typeof value === 'string' ? value : null;
}

function allowsNotifications(status: Notifications.NotificationPermissionsStatus): boolean {
  return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(TASK_REMINDER_CHANNEL_ID, {
    name: 'Task reminders',
    description: 'Due date reminder notifications',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Registers the action buttons a reminder notification carries.
 *
 * Both platforms resolve a notification's category at *delivery* time, not when
 * it is scheduled, so this has to have run before a reminder fires rather than
 * before it is queued. Doing it on every reconcile is the cheap way to be sure:
 * the call is idempotent, and it re-establishes the category after the OS drops
 * it on reinstall.
 *
 * `opensAppToForeground: false` is what makes these feel like a system control
 * instead of a shortcut into the app. It is also what creates the killed-app gap
 * that modules/notification-actions exists to close.
 */
async function ensureNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(TASK_REMINDER_CATEGORY_ID, [
    {
      identifier: COMPLETE_ACTION_ID,
      buttonTitle: 'Mark done',
      options: { opensAppToForeground: false },
    },
    {
      identifier: SNOOZE_ACTION_ID,
      buttonTitle: `Snooze ${Math.round(SNOOZE_DURATION_MS / 60000)} min`,
      options: { opensAppToForeground: false },
    },
  ]);
}

async function ensureNotificationPermission(): Promise<boolean> {
  await ensureNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  if (allowsNotifications(current)) return true;
  if (current.status !== Notifications.PermissionStatus.UNDETERMINED && !current.canAskAgain) return false;
  return allowsNotifications(await Notifications.requestPermissionsAsync());
}

export async function reconcileTaskReminderNotifications(
  desired: TaskReminderNotificationRequest[]
): Promise<void> {
  if (Platform.OS === 'web') return;

  // Unconditionally, before anything else: a launch where nothing needs
  // rescheduling still needs the buttons to exist on reminders already queued.
  await ensureNotificationCategories();

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const desiredById = new Map(desired.map((request) => [request.identifier, request]));
  const existingById = new Map<string, Notifications.NotificationRequest>();
  const cancelled = new Set<string>();

  for (const request of scheduled) {
    if (!ownsIdentifier(request.identifier)) continue;
    existingById.set(request.identifier, request);
    const expected = desiredById.get(request.identifier);
    if (!expected || scheduledFingerprint(request) !== expected.fingerprint) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
      cancelled.add(request.identifier);
    }
  }

  const missing = desired.filter(
    (request) => cancelled.has(request.identifier) || !existingById.has(request.identifier)
  );
  if (missing.length === 0) return;
  if (!(await ensureNotificationPermission())) return;

  for (const request of missing) {
    await Notifications.scheduleNotificationAsync(request.request);
  }
}

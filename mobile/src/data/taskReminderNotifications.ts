import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { addDays, formatDueFull, fromISODate } from './dateUtils';
import { normalizeReminders } from './reminders';
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

export function buildTaskReminderNotificationRequests(
  tasks: Task[],
  now = new Date()
): TaskReminderNotificationRequest[] {
  const nowMs = now.getTime();
  const requests: TaskReminderNotificationRequest[] = [];

  for (const task of tasks) {
    if (task.completed || task.deletedAt || !task.dueDate) continue;
    for (const reminder of normalizeReminders(task.reminders)) {
      const fireAt = taskReminderFireDate(task, reminder);
      if (!fireAt || fireAt.getTime() <= nowMs) continue;

      const title = titleForTask(task);
      const body = `Due ${formatDueFull(task.dueDate, task.dueTime)}`;
      const data: TaskReminderNotificationData = {
        kind: 'taskReminder',
        taskId: task.id,
        reminderId: reminder.id,
        fireAt: fireAt.toISOString(),
      };
      const fingerprint = fingerprintFor(title, body, fireAt);
      const identifier = taskReminderNotificationIdentifier(task.id, reminder.id);

      requests.push({
        identifier,
        taskId: task.id,
        reminderId: reminder.id,
        fireAt,
        fingerprint,
        request: {
          identifier,
          content: {
            title,
            body,
            sound: 'default',
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
      });
    }
  }

  return requests
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.identifier.localeCompare(b.identifier))
    .slice(0, MAX_SCHEDULED_TASK_REMINDERS);
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

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const desiredById = new Map(desired.map((request) => [request.identifier, request]));
  const existingById = new Map<string, Notifications.NotificationRequest>();
  const cancelled = new Set<string>();

  for (const request of scheduled) {
    if (!request.identifier.startsWith(TASK_REMINDER_NOTIFICATION_PREFIX)) continue;
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

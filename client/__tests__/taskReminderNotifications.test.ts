jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'scheduled'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}));

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { task } from '../test/fixtures';
import {
  MAX_SCHEDULED_TASK_REMINDERS,
  TASK_REMINDER_CHANNEL_ID,
  buildTaskReminderNotificationRequests,
  parseTaskReminderNotificationData,
  reconcileTaskReminderNotifications,
  taskReminderFireDate,
  taskReminderNotificationIdentifier,
} from '../src/data/taskReminderNotifications';

function platform(os: 'ios' | 'android' | 'web') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

function granted() {
  return {
    granted: true,
    status: Notifications.PermissionStatus.GRANTED,
    canAskAgain: true,
  } as Notifications.NotificationPermissionsStatus;
}

beforeEach(() => {
  platform('ios');
  jest.clearAllMocks();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(granted());
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue(granted());
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([]);
});

describe('task reminder requests', () => {
  const now = new Date(2026, 9, 20, 8, 0);

  test('calculates local wall-clock fire times and rejects unusable values', () => {
    expect(taskReminderFireDate(
      { dueDate: '2026-10-22' },
      { offsetDays: 2, time: '09:30' }
    )).toEqual(new Date(2026, 9, 20, 9, 30));
    expect(taskReminderFireDate({ dueDate: undefined }, { offsetDays: 0, time: '09:30' })).toBeNull();
    expect(taskReminderFireDate({ dueDate: '2026-10-22' }, { offsetDays: 0, time: 'noon' })).toBeNull();
  });

  test('builds upcoming task and snooze requests in firing order', () => {
    const tasks = [
      task('task-1', {
        title: '  Pay bill  ',
        dueDate: '2026-10-22',
        dueTime: '17:00',
        reminders: [
          { id: 'later', offsetDays: 0, time: '09:00' },
          { id: 'first', offsetDays: 2, time: '09:00' },
          { id: 'past', offsetDays: 3, time: '09:00' },
        ],
      }),
      task('done', {
        completed: true,
        dueDate: '2026-10-22',
        reminders: [{ id: 'r', offsetDays: 0, time: '09:00' }],
      }),
    ];

    const requests = buildTaskReminderNotificationRequests(tasks, [
      { taskId: 'task-1', reminderId: 'snooze', fireAt: '2026-10-20T14:30:00.000Z' },
      { taskId: 'missing', reminderId: 'r', fireAt: '2026-10-20T12:15:00.000Z' },
      { taskId: 'done', reminderId: 'r', fireAt: '2026-10-20T12:15:00.000Z' },
    ], now);

    expect(requests.map((request) => request.reminderId)).toEqual(['first', 'snooze', 'later']);
    expect(requests[0].identifier).toBe(taskReminderNotificationIdentifier('task-1', 'first'));
    expect(requests[0].request.content).toMatchObject({
      title: 'Pay bill',
      sound: 'default',
      categoryIdentifier: 'taskReminder',
      data: { kind: 'taskReminder', taskId: 'task-1', reminderId: 'first' },
    });
    expect(requests[1].identifier).toBe('yarukoto:taskSnooze:task-1:snooze');
  });

  test('uses a fallback title and caps the nearest reminders', () => {
    const tasks = Array.from({ length: MAX_SCHEDULED_TASK_REMINDERS + 5 }, (_, index) => task(`t-${index}`, {
      title: ' ',
      dueDate: '2026-10-21',
      reminders: [{ id: 'r', offsetDays: 0, time: `${String(10 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}` }],
    }));
    const requests = buildTaskReminderNotificationRequests(tasks, [], now);
    expect(requests).toHaveLength(MAX_SCHEDULED_TASK_REMINDERS);
    expect(requests[0].request.content.title).toBe('Task reminder');
    expect(requests.at(-1)?.taskId).toBe('t-59');
  });

  test('parses only reminder notification payloads', () => {
    const data = { kind: 'taskReminder', taskId: 'task-1', reminderId: 'r', fireAt: '2026-10-20T13:00:00.000Z' };
    expect(parseTaskReminderNotificationData(data)).toEqual(data);
    expect(parseTaskReminderNotificationData({ ...data, kind: 'other' })).toBeNull();
    expect(parseTaskReminderNotificationData({ ...data, taskId: 4 })).toBeNull();
    expect(parseTaskReminderNotificationData(undefined)).toBeNull();
  });
});

describe('notification reconciliation', () => {
  const now = new Date(2026, 9, 20, 8, 0);

  function desired() {
    return buildTaskReminderNotificationRequests([task('task-1', {
      dueDate: '2026-10-21',
      reminders: [{ id: 'r', offsetDays: 0, time: '09:00' }],
    })], [], now)[0];
  }

  test('keeps matching reminders, replaces stale ones, and leaves foreign notifications alone', async () => {
    const request = desired();
    const matching = request.request as unknown as Notifications.NotificationRequest;
    const stale = {
      ...matching,
      identifier: 'yarukoto:taskSnooze:task-1:old',
      content: { ...matching.content, data: { yarukotoReminderFingerprint: 'old' } },
    };
    const foreign = { ...matching, identifier: 'another-app' };
    jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([matching, stale, foreign]);

    await reconcileTaskReminderNotifications([request]);

    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(stale.identifier);
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith(foreign.identifier);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('cancels stale reminders but does not replace them when permission is denied', async () => {
    const request = desired();
    const stale = {
      ...(request.request as unknown as Notifications.NotificationRequest),
      content: { ...request.request.content, data: { yarukotoReminderFingerprint: 'old' } },
    } as unknown as Notifications.NotificationRequest;
    jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([stale]);
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: false,
      status: Notifications.PermissionStatus.DENIED,
      canAskAgain: false,
    } as Notifications.NotificationPermissionsStatus);

    await reconcileTaskReminderNotifications([request]);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(request.identifier);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('creates the Android channel, asks when allowed, and schedules missing requests', async () => {
    platform('android');
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: false,
      status: Notifications.PermissionStatus.UNDETERMINED,
      canAskAgain: true,
    } as Notifications.NotificationPermissionsStatus);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue(granted());
    const request = desired();

    await reconcileTaskReminderNotifications([request]);

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      TASK_REMINDER_CHANNEL_ID,
      expect.objectContaining({ name: 'Task reminders' })
    );
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(request.request);
  });

  test('accepts provisional iOS permission and is inert on web', async () => {
    const request = desired();
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: false,
      status: Notifications.PermissionStatus.DENIED,
      canAskAgain: false,
      ios: { status: Notifications.IosAuthorizationStatus.PROVISIONAL },
    } as Notifications.NotificationPermissionsStatus);
    await reconcileTaskReminderNotifications([request]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(request.request);

    jest.clearAllMocks();
    platform('web');
    await reconcileTaskReminderNotifications([request]);
    expect(Notifications.setNotificationCategoryAsync).not.toHaveBeenCalled();
  });
});

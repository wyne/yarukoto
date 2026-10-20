const mockAsyncItems = new Map<string, string>();
const mockTaskManager = {
  defined: false,
  handler: undefined as ((event: { data?: unknown }) => Promise<void>) | undefined,
};
const originalFetch = global.fetch;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncItems.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncItems.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockAsyncItems.delete(key);
  }),
}));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  scheduleNotificationAsync: jest.fn(async () => 'scheduled'),
}));

jest.mock('expo-task-manager', () => ({
  isTaskDefined: jest.fn(() => mockTaskManager.defined),
  defineTask: jest.fn((_name: string, handler: (event: { data?: unknown }) => Promise<void>) => {
    mockTaskManager.defined = true;
    mockTaskManager.handler = handler;
  }),
}));

jest.mock('../src/data/storage', () => ({
  readStoredToken: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import {
  COMPLETE_ACTION_ID,
  PENDING_ACTIONS_KEY,
  SNOOZE_ACTION_ID,
  SNOOZE_DURATION_MS,
} from '../src/data/notificationActions';
import { NOTIFICATION_ACTION_TASK, defineNotificationActionTask } from '../src/data/notificationActionTask';
import { readStoredToken } from '../src/data/storage';

function response(actionIdentifier: string, data: Record<string, unknown> = {}) {
  return {
    actionIdentifier,
    notification: {
      request: {
        content: {
          title: 'Pay bill',
          body: 'Due tomorrow',
          data: {
            kind: 'taskReminder',
            taskId: 'task/a',
            reminderId: 'r-1',
            fireAt: '2026-10-20T12:00:00.000Z',
            ...data,
          },
        },
      },
    },
  };
}

async function dispatch(data: unknown) {
  expect(mockTaskManager.handler).toBeDefined();
  await mockTaskManager.handler!({ data });
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
  mockAsyncItems.clear();
  mockTaskManager.defined = false;
  mockTaskManager.handler = undefined;
  jest.mocked(readStoredToken).mockReset().mockResolvedValue('token');
  jest.mocked(Notifications.scheduleNotificationAsync).mockReset().mockResolvedValue('scheduled');
  global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;
  jest.mocked(TaskManager.isTaskDefined).mockClear();
  jest.mocked(TaskManager.defineTask).mockClear();
  defineNotificationActionTask();
});

afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

test('registers the headless task only once', () => {
  expect(TaskManager.defineTask).toHaveBeenCalledWith(NOTIFICATION_ACTION_TASK, expect.any(Function));
  defineNotificationActionTask();
  expect(TaskManager.defineTask).toHaveBeenCalledTimes(1);
});

test('queues completion before posting the narrow server update', async () => {
  mockAsyncItems.set('yarukoto.serverUrl', 'https://tasks.test///');

  await dispatch(response(COMPLETE_ACTION_ID));

  expect(JSON.parse(mockAsyncItems.get(PENDING_ACTIONS_KEY)!)).toEqual([{
    action: COMPLETE_ACTION_ID,
    taskId: 'task/a',
    reminderId: 'r-1',
    at: '2026-10-20T12:00:00.000Z',
  }]);
  expect(global.fetch).toHaveBeenCalledWith('https://tasks.test/api/v1/tasks/task%2Fa/complete', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ completedAt: '2026-10-20T12:00:00.000Z' }),
  });
});

test('keeps completion queued when credentials are absent or the request fails', async () => {
  mockAsyncItems.set('yarukoto.serverUrl', 'https://tasks.test');
  jest.mocked(readStoredToken).mockResolvedValue(null);
  await dispatch(response(COMPLETE_ACTION_ID));
  expect(global.fetch).not.toHaveBeenCalled();

  jest.mocked(readStoredToken).mockResolvedValue('token');
  jest.mocked(global.fetch).mockRejectedValueOnce(new Error('offline'));
  await expect(dispatch(response(COMPLETE_ACTION_ID))).resolves.toBeUndefined();
  expect(JSON.parse(mockAsyncItems.get(PENDING_ACTIONS_KEY)!)).toHaveLength(2);
});

test('schedules and queues a snooze without contacting the server', async () => {
  await dispatch(response(SNOOZE_ACTION_ID));

  const fireAt = new Date(Date.now() + SNOOZE_DURATION_MS);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    identifier: 'yarukoto:taskSnooze:task/a:r-1',
    content: expect.objectContaining({
      title: 'Pay bill',
      body: 'Due tomorrow',
      categoryIdentifier: 'taskReminder',
      data: expect.objectContaining({ fireAt: fireAt.toISOString() }),
    }),
    trigger: { type: 'date', date: fireAt },
  }));
  expect(JSON.parse(mockAsyncItems.get(PENDING_ACTIONS_KEY)!)).toEqual([expect.objectContaining({
    action: SNOOZE_ACTION_ID,
    taskId: 'task/a',
    reminderId: 'r-1',
    fireAt: fireAt.toISOString(),
  })]);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('still queues a snooze when the OS refuses to schedule it', async () => {
  jest.mocked(Notifications.scheduleNotificationAsync).mockRejectedValueOnce(new Error('permission denied'));
  await expect(dispatch(response(SNOOZE_ACTION_ID))).resolves.toBeUndefined();
  expect(JSON.parse(mockAsyncItems.get(PENDING_ACTIONS_KEY)!)).toHaveLength(1);
});

test('ignores dismissals and malformed reminder payloads', async () => {
  await dispatch(undefined);
  await dispatch({ actionIdentifier: 'dismiss' });
  await dispatch(response(COMPLETE_ACTION_ID, { kind: 'other' }));
  expect(mockAsyncItems.has(PENDING_ACTIONS_KEY)).toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
});

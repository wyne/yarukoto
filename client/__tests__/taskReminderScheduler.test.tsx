import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AppState, Platform } from 'react-native';
import { task } from '../test/fixtures';

const mockRuntime = {
  os: 'ios',
  appState: 'active',
  appStateListeners: [] as Array<(state: string) => void>,
  appStateRemovers: [] as jest.Mock[],
  responseListeners: [] as Array<(response: any) => void>,
  responseRemovers: [] as jest.Mock[],
};

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn((listener: (response: any) => void) => {
    mockRuntime.responseListeners.push(listener);
    const remove = jest.fn();
    mockRuntime.responseRemovers.push(remove);
    return { remove };
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('../modules/notification-actions/src/NotificationActionsModule', () => ({
  drainNativePendingActions: jest.fn(),
}));

jest.mock('../src/data/TaskContext', () => ({
  useTasks: jest.fn(),
}));

jest.mock('../src/data/storage', () => ({
  loadSnoozes: jest.fn(),
  saveSnoozes: jest.fn(),
}));

jest.mock('../src/data/notificationActions', () => {
  const actual = jest.requireActual('../src/data/notificationActions');
  return {
    ...actual,
    drainStoredPendingActions: jest.fn(),
  };
});

jest.mock('../src/data/taskReminderNotifications', () => ({
  buildTaskReminderNotificationRequests: jest.fn((_tasks: unknown[], snoozes: unknown[]) => [{
    identifier: `desired:${snoozes.length}`,
  }]),
  parseTaskReminderNotificationData: jest.fn((data: Record<string, unknown> | undefined) =>
    data?.kind === 'taskReminder' && typeof data.taskId === 'string' && typeof data.reminderId === 'string'
      ? data
      : null
  ),
  reconcileTaskReminderNotifications: jest.fn(async () => undefined),
}));

import * as Notifications from 'expo-notifications';
import TaskReminderNotificationScheduler from '../src/data/TaskReminderNotificationScheduler';
import { useTasks } from '../src/data/TaskContext';
import { drainNativePendingActions } from '../modules/notification-actions/src/NotificationActionsModule';
import {
  COMPLETE_ACTION_ID,
  SNOOZE_ACTION_ID,
  drainStoredPendingActions,
} from '../src/data/notificationActions';
import { loadSnoozes, saveSnoozes } from '../src/data/storage';
import {
  buildTaskReminderNotificationRequests,
  reconcileTaskReminderNotifications,
} from '../src/data/taskReminderNotifications';

const completeAt = jest.fn();
const scheduledTask = task('t-1', {
  dueDate: '2026-10-21',
  reminders: [{ id: 'r-1', offsetDays: 0, time: '09:00' }],
});

async function settle(turns = 12) {
  await act(async () => {
    for (let i = 0; i < turns; i += 1) await Promise.resolve();
  });
}

async function renderScheduler(): Promise<ReactTestRenderer> {
  let root: ReactTestRenderer;
  await act(async () => {
    root = create(<TaskReminderNotificationScheduler />);
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
  return root!;
}

function notificationResponse(actionIdentifier: string, data: Record<string, unknown> = {}) {
  return {
    actionIdentifier,
    notification: {
      request: {
        content: {
          data: {
            kind: 'taskReminder',
            taskId: 't-1',
            reminderId: 'r-1',
            fireAt: '2026-10-20T12:00:00.000Z',
            ...data,
          },
        },
      },
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
  jest.clearAllMocks();
  mockRuntime.os = 'ios';
  mockRuntime.appState = 'active';
  mockRuntime.appStateListeners = [];
  mockRuntime.appStateRemovers = [];
  mockRuntime.responseListeners = [];
  mockRuntime.responseRemovers = [];
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => mockRuntime.os });
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => mockRuntime.appState });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    mockRuntime.appStateListeners.push(listener as (state: string) => void);
    const remove = jest.fn();
    mockRuntime.appStateRemovers.push(remove);
    return { remove };
  });
  completeAt.mockReset();
  jest.mocked(useTasks).mockReturnValue({
    state: { mode: 'server', tasks: [scheduledTask] },
    completeAt,
  } as unknown as ReturnType<typeof useTasks>);
  jest.mocked(drainNativePendingActions).mockReturnValue([]);
  jest.mocked(drainStoredPendingActions).mockResolvedValue([]);
  jest.mocked(loadSnoozes).mockReturnValue([]);
  jest.mocked(reconcileTaskReminderNotifications).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('drains completion and snooze actions before reconciling their resulting requests', async () => {
  jest.mocked(drainNativePendingActions).mockReturnValue([
    { action: COMPLETE_ACTION_ID, taskId: 't-1', reminderId: 'r-1', at: '2026-10-20T11:30:00.000Z' },
    { action: 'retired-action' },
  ]);
  jest.mocked(drainStoredPendingActions)
    .mockResolvedValueOnce([
      {
        action: SNOOZE_ACTION_ID,
        taskId: 't-1',
        reminderId: 'r-1',
        at: '2026-10-20T12:00:00.000Z',
        fireAt: '2026-10-20T13:00:00.000Z',
      },
    ])
    .mockResolvedValue([]);

  const root = await renderScheduler();

  expect(completeAt).toHaveBeenCalledWith('t-1', '2026-10-20T11:30:00.000Z');
  expect(saveSnoozes).toHaveBeenCalledWith([
    { taskId: 't-1', reminderId: 'r-1', fireAt: '2026-10-20T13:00:00.000Z' },
  ]);
  expect(buildTaskReminderNotificationRequests).toHaveBeenLastCalledWith(
    [scheduledTask],
    [{ taskId: 't-1', reminderId: 'r-1', fireAt: '2026-10-20T13:00:00.000Z' }]
  );
  expect(reconcileTaskReminderNotifications).toHaveBeenLastCalledWith([
    expect.objectContaining({ identifier: 'desired:1' }),
  ]);

  act(() => root.unmount());
  expect(mockRuntime.appStateRemovers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  expect(mockRuntime.responseRemovers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
});

test('iOS foreground actions prompt an immediate queue drain', async () => {
  const root = await renderScheduler();
  const drainsBefore = jest.mocked(drainStoredPendingActions).mock.calls.length;
  jest.mocked(drainNativePendingActions).mockReturnValue([]);
  jest.mocked(drainStoredPendingActions).mockResolvedValue([]);

  act(() => mockRuntime.responseListeners[0](notificationResponse(COMPLETE_ACTION_ID)));
  await settle();

  expect(drainStoredPendingActions).toHaveBeenCalledTimes(drainsBefore + 1);
  expect(completeAt).not.toHaveBeenCalled();
  act(() => root.unmount());
});

test('Android foreground actions complete or snooze locally', async () => {
  mockRuntime.os = 'android';
  const root = await renderScheduler();
  const listener = mockRuntime.responseListeners[0];

  act(() => listener(notificationResponse(COMPLETE_ACTION_ID)));
  expect(completeAt).toHaveBeenCalledWith('t-1', '2026-10-20T12:00:00.000Z');

  act(() => listener(notificationResponse(SNOOZE_ACTION_ID)));
  expect(saveSnoozes).toHaveBeenCalledWith([
    { taskId: 't-1', reminderId: 'r-1', fireAt: '2026-10-20T13:00:00.000Z' },
  ]);

  completeAt.mockClear();
  jest.mocked(saveSnoozes).mockClear();
  act(() => {
    listener(notificationResponse('dismiss'));
    listener(notificationResponse(COMPLETE_ACTION_ID, { kind: 'other' }));
  });
  expect(completeAt).not.toHaveBeenCalled();
  expect(saveSnoozes).not.toHaveBeenCalled();
  act(() => root.unmount());
});

test('foregrounding reconciles again and a failed cycle does not block the next one', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.mocked(reconcileTaskReminderNotifications)
    .mockRejectedValueOnce(new Error('OS unavailable'))
    .mockResolvedValue(undefined);
  const root = await renderScheduler();
  expect(warning).toHaveBeenCalledWith('Task reminder notification sync failed', expect.any(Error));

  act(() => mockRuntime.appStateListeners[0]('active'));
  await settle();
  expect(reconcileTaskReminderNotifications).toHaveBeenCalledTimes(2);

  warning.mockRestore();
  act(() => root.unmount());
});

test('web mode installs no native listeners and performs no reconciliation', async () => {
  mockRuntime.os = 'web';
  const root = await renderScheduler();
  expect(reconcileTaskReminderNotifications).not.toHaveBeenCalled();
  expect(Notifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  expect(mockRuntime.appStateListeners).toEqual([]);
  act(() => root.unmount());
});

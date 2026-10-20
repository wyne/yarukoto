const mockItems = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockItems.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockItems.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockItems.delete(key);
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COMPLETE_ACTION_ID,
  PENDING_ACTIONS_KEY,
  SNOOZE_ACTION_ID,
  appendStoredPendingAction,
  drainStoredPendingActions,
  parsePendingNotificationAction,
  pruneSnoozes,
  taskSnoozeNotificationIdentifier,
  withSnooze,
  withoutSnoozesFor,
} from '../src/data/notificationActions';

const at = '2026-10-20T12:00:00.000Z';

beforeEach(() => {
  mockItems.clear();
  jest.clearAllMocks();
});

describe('pending notification actions', () => {
  test('accepts durable actions defensively and ignores unknown fields', () => {
    expect(parsePendingNotificationAction({
      action: SNOOZE_ACTION_ID,
      taskId: 'task-1',
      reminderId: 'reminder-1',
      at,
      fireAt: '2026-10-20T13:00:00.000Z',
      ignored: true,
    })).toEqual({
      action: SNOOZE_ACTION_ID,
      taskId: 'task-1',
      reminderId: 'reminder-1',
      at,
      fireAt: '2026-10-20T13:00:00.000Z',
    });
    expect(parsePendingNotificationAction({
      action: COMPLETE_ACTION_ID,
      taskId: 'task-1',
      reminderId: '',
      at,
      fireAt: 'not-a-date',
    })).toEqual({ action: COMPLETE_ACTION_ID, taskId: 'task-1', reminderId: '', at, fireAt: undefined });
  });

  test.each([
    null,
    'action',
    {},
    { action: 'dismiss', taskId: 'task-1', reminderId: 'r', at },
    { action: COMPLETE_ACTION_ID, taskId: '', reminderId: 'r', at },
    { action: COMPLETE_ACTION_ID, taskId: 'task-1', reminderId: 3, at },
    { action: COMPLETE_ACTION_ID, taskId: 'task-1', reminderId: 'r', at: 'later' },
  ])('rejects malformed queue entry %#', (entry) => {
    expect(parsePendingNotificationAction(entry)).toBeNull();
  });

  test('appends without discarding an existing native-written queue', async () => {
    mockItems.set(PENDING_ACTIONS_KEY, JSON.stringify([{ native: 'entry' }]));
    const entry = { action: COMPLETE_ACTION_ID, taskId: 'task-1', reminderId: 'r', at } as const;

    await appendStoredPendingAction(entry);

    expect(JSON.parse(mockItems.get(PENDING_ACTIONS_KEY)!)).toEqual([{ native: 'entry' }, entry]);
  });

  test('drains once and returns only valid entries', async () => {
    const valid = { action: COMPLETE_ACTION_ID, taskId: 'task-1', reminderId: 'r', at } as const;
    mockItems.set(PENDING_ACTIONS_KEY, JSON.stringify([valid, { action: 'old-action' }]));

    await expect(drainStoredPendingActions()).resolves.toEqual([valid]);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(PENDING_ACTIONS_KEY);
    await expect(drainStoredPendingActions()).resolves.toEqual([]);
  });

  test('treats corrupt or non-array storage as an empty queue', async () => {
    mockItems.set(PENDING_ACTIONS_KEY, '{broken');
    await expect(drainStoredPendingActions()).resolves.toEqual([]);
    mockItems.set(PENDING_ACTIONS_KEY, JSON.stringify({ action: COMPLETE_ACTION_ID }));
    await expect(drainStoredPendingActions()).resolves.toEqual([]);
  });
});

describe('device-local snoozes', () => {
  const first = { taskId: 'task-1', reminderId: 'r', fireAt: '2026-10-20T13:00:00.000Z' };

  test('uses stable notification identifiers', () => {
    expect(taskSnoozeNotificationIdentifier('task-1', 'r')).toBe('yarukoto:taskSnooze:task-1:r');
  });

  test('prunes spent and invalid snoozes', () => {
    expect(pruneSnoozes([
      { ...first, fireAt: '2026-10-20T11:59:59.000Z' },
      first,
      { ...first, reminderId: 'bad', fireAt: 'invalid' },
    ], new Date(at))).toEqual([first]);
  });

  test('replaces one reminder without disturbing the others', () => {
    const other = { taskId: 'task-1', reminderId: 'other', fireAt: '2026-10-20T14:00:00.000Z' };
    const replacement = { ...first, fireAt: '2026-10-20T15:00:00.000Z' };
    expect(withSnooze([first, other], replacement)).toEqual([other, replacement]);
  });

  test('removes every snooze belonging to completed tasks', () => {
    const other = { taskId: 'task-2', reminderId: 'r', fireAt: '2026-10-20T14:00:00.000Z' };
    expect(withoutSnoozesFor([first, other], new Set(['task-1']))).toEqual([other]);
  });
});

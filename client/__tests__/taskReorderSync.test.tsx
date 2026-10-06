import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { TaskProvider, useTasks } from '../src/data/TaskContext';
import { saveDirtyIds } from '../src/data/storage';
import type { Task } from '../src/data/types';

const task = (id: string, order: number, patch: Partial<Task> = {}): Task => ({
  id,
  title: id,
  notes: '',
  priority: 'none',
  listId: null,
  tags: [],
  subtasks: [],
  completed: false,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  order,
  ...patch,
});

// This gap forces computeOrders through its precision-renumber fallback.
const mockInitialTasks = [
  task('a', 0),
  task('b', 0.0000005),
  task('c', 0.5),
  task('d', 1),
  task('other-list', 10, { listId: 'l-other' }),
  task('completed', 11, { completed: true, completedAt: '2026-10-02T12:30:00.000Z' }),
  task('deleted', 12, { deletedAt: '2026-10-02T12:30:00.000Z' }),
  task('shared-list', 13, { listId: 'l-shared' }),
];
const mockSaveDirtyIds = saveDirtyIds as jest.MockedFunction<typeof saveDirtyIds>;

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(),
  useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(async () => undefined) }),
}));

jest.mock('../modules/notification-actions/src/NotificationActionsModule', () => ({
  setNativeCredentials: jest.fn(),
}));

jest.mock('../src/data/storage', () => ({
  addSavedServer: jest.fn(),
  clearDirtyIds: jest.fn(),
  clearServerSnapshot: jest.fn(),
  clearServerUrl: jest.fn(),
  clearToken: jest.fn(),
  loadDirtyIds: () => [],
  loadMode: () => 'server',
  loadServerSnapshot: () => ({
    schemaVersion: 1,
    tasks: mockInitialTasks,
    lists: [
      { id: 'l-other', name: 'Other', folderId: null, order: 0, updatedAt: '2026-10-02T12:00:00.000Z' },
      {
        id: 'l-shared',
        name: 'Shared',
        folderId: null,
        order: 1,
        shared: true,
        ownerId: 'u-owner',
        updatedAt: '2026-10-02T12:00:00.000Z',
      },
    ],
    folders: [],
    viewPrefs: [],
    savedFilters: [],
    serverFeatures: [],
    cursor: 'cursor-before',
    savedAt: '2026-10-02T12:00:00.000Z',
  }),
  loadServerUrl: () => 'http://server.test',
  loadToken: () => 'token',
  removeSavedServer: jest.fn(),
  saveDirtyIds: jest.fn(),
  saveMode: jest.fn(),
  saveServerSnapshot: jest.fn(),
  saveServerUrl: jest.fn(),
  saveToken: jest.fn(),
}));

jest.mock('../src/data/api', () => {
  const actual = jest.requireActual('../src/data/api');
  const emptyBatch = {
    now: 'cursor-after',
    tasks: [],
    lists: [],
    folders: [],
    viewPrefs: [],
    savedFilters: [],
    removed: { tasks: [], lists: [] },
  };
  return {
    ...actual,
    createApi: () => ({
      health: async () => ({ version: '', commit: null, commitShort: null, builtAt: null, features: [] }),
      pull: async () => emptyBatch,
      push: async () => emptyBatch,
    }),
  };
});

test('precision respace queues only tasks changed in its local window', async () => {
  let root: ReactTestRenderer | undefined;
  let context: ReturnType<typeof useTasks> | undefined;

  function CaptureContext() {
    context = useTasks();
    return null;
  }

  await act(async () => {
    root = create(
      <TaskProvider>
        <CaptureContext />
      </TaskProvider>
    );
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
  mockSaveDirtyIds.mockClear();

  act(() => context!.reorderTasks(['d'], 'a', 'b'));

  // Only the dragged task and its local collision peer enter the outbox. Tasks
  // from other, completed, deleted, and shared-list scopes stay untouched.
  expect(mockSaveDirtyIds).toHaveBeenCalledWith(['d', 'b']);
  expect(context!.state.tasks.map(({ id, order }) => ({ id, order }))).toEqual([
    { id: 'a', order: 0 },
    { id: 'b', order: 1 / 3 },
    { id: 'c', order: 0.5 },
    { id: 'd', order: 1 / 6 },
    { id: 'other-list', order: 10 },
    { id: 'completed', order: 11 },
    { id: 'deleted', order: 12 },
    { id: 'shared-list', order: 13 },
  ]);
  for (const id of ['a', 'c', 'other-list', 'completed', 'deleted', 'shared-list']) {
    expect(context!.state.tasks.find((row) => row.id === id)).toBe(mockInitialTasks.find((row) => row.id === id));
  }

  act(() => root?.unmount());
});

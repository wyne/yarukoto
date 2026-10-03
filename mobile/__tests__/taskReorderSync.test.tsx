import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { TaskProvider, useTasks } from '../src/data/TaskContext';
import { saveDirtyIds } from '../src/data/storage';
import type { Task } from '../src/data/types';

const task = (id: string, order: number): Task => ({
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
});

// This gap forces computeOrders through its precision-renumber fallback.
const mockInitialTasks = [task('a', 0), task('b', 0.0000005), task('c', 0.5), task('d', 1)];
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
    lists: [],
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

test('precision renumber queues every task whose order changed', async () => {
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

  // d keeps numeric order 1. The fallback respaces b and c, including c outside
  // the moved/previous/next set used before this fix, so both enter the outbox.
  expect(mockSaveDirtyIds).toHaveBeenCalledWith(['b', 'c']);
  expect(context!.state.tasks.map(({ id, order }) => ({ id, order }))).toEqual([
    { id: 'a', order: 0 },
    { id: 'b', order: 2 },
    { id: 'c', order: 3 },
    { id: 'd', order: 1 },
  ]);

  act(() => root?.unmount());
});

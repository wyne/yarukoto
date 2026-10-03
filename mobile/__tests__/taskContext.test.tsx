import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { reduceTaskState, TaskProvider, useTasks } from '../src/data/TaskContext';
import { saveDirtyIds } from '../src/data/storage';
import type { Task } from '../src/data/types';

const localTask = (id: string, title: string): Task => ({
  id,
  title,
  notes: '',
  priority: 'none',
  listId: null,
  tags: [],
  subtasks: [],
  completed: false,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  order: 0,
});

// The mock prefix keeps Jest from hoisting this fixture ahead of localTask.
const mockInitialTask = localTask('t-notification', 'Notification task');

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
    tasks: [mockInitialTask],
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

test('each queued merge keeps the dirty snapshot captured with that action', () => {
  const firstLocal = localTask('t-first', 'First local edit');
  const secondLocal = localTask('t-second', 'Second local edit');
  const state = {
    tasks: [firstLocal, secondLocal],
    lists: [],
    folders: [],
    viewPrefs: [],
    savedFilters: [],
    mode: 'server' as const,
    serverUrl: 'http://server.test',
    token: 'token',
  };
  const incoming = [
    { ...firstLocal, title: 'First from server' },
    { ...secondLocal, title: 'Second from server' },
  ];
  const emptyCollections = { lists: [], folders: [], viewPrefs: [], savedFilters: [] };
  const firstQueued = {
    type: 'MERGE' as const,
    dirtyIds: new Set([firstLocal.id]),
    tasks: incoming,
    ...emptyCollections,
  };
  const secondQueued = {
    type: 'MERGE' as const,
    dirtyIds: new Set([secondLocal.id]),
    tasks: incoming,
    ...emptyCollections,
  };

  // Construct both actions before reducing either, just as React may queue two
  // dispatches before rendering. Neither action can overwrite the other's set.
  const afterFirst = reduceTaskState(state, firstQueued);
  const afterSecond = reduceTaskState(state, secondQueued);

  expect(afterFirst.tasks.map((task) => task.title)).toEqual(['First local edit', 'Second from server']);
  expect(afterSecond.tasks.map((task) => task.title)).toEqual(['First from server', 'Second local edit']);
});

test('stale and missing notification completions do not enter the outbox', async () => {
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

  act(() => {
    context!.completeAt('t-missing', '2026-10-02T13:00:00.000Z');
    context!.completeAt(mockInitialTask.id, '2026-10-02T11:00:00.000Z');
  });
  expect(mockSaveDirtyIds).not.toHaveBeenCalled();

  act(() => context!.completeAt(mockInitialTask.id, '2026-10-02T13:00:00.000Z'));
  expect(mockSaveDirtyIds).toHaveBeenCalledWith([mockInitialTask.id]);

  act(() => root?.unmount());
});

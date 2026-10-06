import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { TaskProvider } from '../src/data/TaskContext';
import { saveServerSnapshot } from '../src/data/storage';
import type { ServerSnapshot } from '../src/data/storage';

const mockSaveServerSnapshot = saveServerSnapshot as jest.MockedFunction<typeof saveServerSnapshot>;

const initialSnapshot: ServerSnapshot = {
  schemaVersion: 1,
  tasks: [],
  lists: [],
  folders: [],
  viewPrefs: [],
  savedFilters: [],
  serverFeatures: [],
  cursor: 'cursor-before',
  savedAt: '2026-10-02T12:00:00.000Z',
};

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
  loadServerSnapshot: () => initialSnapshot,
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
  return {
    ...actual,
    createApi: () => ({
      health: async () => ({ version: '', commit: null, commitShort: null, builtAt: null, features: [] }),
      pull: async () => ({
        now: 'cursor-after',
        tasks: [
          {
            id: 't-pulled',
            title: 'Arrived from another device',
            notes: '',
            priority: 'none',
            listId: null,
            tags: [],
            subtasks: [],
            completed: false,
            createdAt: '2026-10-02T12:01:00.000Z',
            updatedAt: '2026-10-02T12:01:00.000Z',
            order: 0,
          },
        ],
        lists: [],
        folders: [],
        viewPrefs: [],
        savedFilters: [],
        removed: { tasks: [], lists: [] },
      }),
    }),
  };
});

describe('sync snapshot persistence', () => {
  let root: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    mockSaveServerSnapshot.mockClear();
  });

  test('never saves a pulled cursor with the pre-pull collections', async () => {
    await act(async () => {
      root = create(<TaskProvider>{null}</TaskProvider>);
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });

    const advancedSnapshots = mockSaveServerSnapshot.mock.calls
      .map(([snapshot]) => snapshot)
      .filter((snapshot) => snapshot.cursor === 'cursor-after');

    expect(advancedSnapshots.length).toBeGreaterThan(0);
    expect(advancedSnapshots.every((snapshot) => snapshot.tasks.some((task) => task.id === 't-pulled'))).toBe(true);
  });
});

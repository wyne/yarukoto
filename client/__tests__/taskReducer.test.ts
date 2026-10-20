jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(),
  useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(async () => undefined) }),
}));

jest.mock('../modules/notification-actions/src/NotificationActionsModule', () => ({
  setNativeCredentials: jest.fn(),
}));

jest.mock('../src/data/storage', () => ({}));

import { reduceTaskState } from '../src/data/TaskContext';
import { DEFAULT_VIEW_OPTIONS } from '../src/data/viewOptions';
import { folder, list, task } from '../test/fixtures';
import type { SavedFilter, Task } from '../src/data/types';

const OLD = '2026-10-01T12:00:00.000Z';
const NOW = '2026-10-20T12:00:00.000Z';

type ReducerState = Parameters<typeof reduceTaskState>[0];
type ReducerAction = Parameters<typeof reduceTaskState>[1];

function state(overrides: Partial<ReducerState> = {}): ReducerState {
  return {
    tasks: [] as Task[],
    lists: [],
    folders: [],
    viewPrefs: [],
    savedFilters: [] as SavedFilter[],
    mode: 'server' as const,
    serverUrl: 'https://tasks.test',
    token: 'token',
    ...overrides,
  };
}

function reduce(current: ReducerState, action: ReducerAction): ReducerState {
  return reduceTaskState(current, action);
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(NOW));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('task reducer', () => {
  test('adds, updates, completes, restores, and purges tasks with timestamps', () => {
    const original = task('t-1', { updatedAt: OLD });
    let next = reduce(state(), { type: 'ADD_TASK', task: original });
    expect(next.tasks[0].updatedAt).toBe(NOW);

    next = reduce(next, {
      type: 'UPDATE_TASK',
      id: 't-1',
      patch: { reminders: [{ id: 'r-1', offsetDays: 0, time: '09:00' }] },
    });
    expect(next.tasks[0]).toMatchObject({ dueDate: '2026-10-20', updatedAt: NOW });

    next = reduce(next, { type: 'TOGGLE_COMPLETE', id: 't-1', at: NOW });
    expect(next.tasks[0]).toMatchObject({ completed: true, completedAt: NOW });
    next = reduce(next, { type: 'TOGGLE_COMPLETE', id: 't-1', at: NOW });
    expect(next.tasks[0].completed).toBe(false);
    expect(next.tasks[0].completedAt).toBeUndefined();

    next = reduce(next, { type: 'DELETE_TASKS', ids: ['t-1'] });
    expect(next.tasks[0].deletedAt).toBe(NOW);
    next = reduce(next, { type: 'RESTORE_TASKS', ids: ['t-1'] });
    expect(next.tasks[0].deletedAt).toBeUndefined();
    next = reduce(next, { type: 'PURGE_TASKS', ids: ['t-1'] });
    expect(next.tasks).toEqual([]);
  });

  test('bulk edits and checklist actions preserve untouched task identity', () => {
    const first = task('first', { updatedAt: OLD, subtasks: [{ id: 's-1', title: 'One', done: false }] });
    const untouched = task('untouched', { updatedAt: OLD });
    let next = reduce(state({ tasks: [first, untouched] }), {
      type: 'BULK_UPDATE', ids: ['first'], patch: { priority: 'high' },
    });
    expect(next.tasks[0]).toMatchObject({ priority: 'high', updatedAt: NOW });
    expect(next.tasks[1]).toBe(untouched);

    next = reduce(next, { type: 'ADD_SUBTASK', taskId: 'first', title: 'Two' });
    expect(next.tasks[0].subtasks.map((item) => [item.title, item.done])).toEqual([
      ['One', false], ['Two', false],
    ]);
    next = reduce(next, { type: 'TOGGLE_SUBTASK', taskId: 'first', subtaskId: 's-1' });
    expect(next.tasks[0].subtasks[0].done).toBe(true);
  });

  test('uses the action time for notification completion and ignores stale taps', () => {
    const current = task('t-1', { updatedAt: '2026-10-20T11:00:00.000Z' });
    const base = state({ tasks: [current] });
    expect(reduce(base, {
      type: 'COMPLETE_AT', id: 't-1', at: '2026-10-20T10:00:00.000Z',
    }).tasks[0]).toBe(current);

    expect(reduce(base, {
      type: 'COMPLETE_AT', id: 't-1', at: '2026-10-20T11:30:00.000Z',
    }).tasks[0]).toMatchObject({
      completed: true,
      completedAt: '2026-10-20T11:30:00.000Z',
      updatedAt: '2026-10-20T11:30:00.000Z',
    });
  });

  test('rolls and skips repeating occurrences', () => {
    const repeating = task('repeat', {
      dueDate: '2026-10-20',
      updatedAt: OLD,
      repeat: { rule: 'FREQ=DAILY;INTERVAL=1', from: 'due' },
    });
    const completed = reduce(state({ tasks: [repeating] }), {
      type: 'TOGGLE_COMPLETE', id: 'repeat', at: NOW,
    });
    expect(completed.tasks).toHaveLength(2);
    expect(completed.tasks[0]).toMatchObject({ id: 'repeat', dueDate: '2026-10-21', completed: false });
    expect(completed.tasks[1]).toMatchObject({ dueDate: '2026-10-20', completed: true, repeat: null });

    const skipped = reduce(state({ tasks: [repeating] }), {
      type: 'SKIP_OCCURRENCE', id: 'repeat', at: NOW,
    });
    expect(skipped.tasks[0]).toMatchObject({ dueDate: '2026-10-21', completed: false });
  });

  test('sets due days and applies explicit task ordering', () => {
    const first = task('first', { order: 0, updatedAt: OLD });
    const second = task('second', { order: 1, updatedAt: OLD });
    let next = reduce(state({ tasks: [first, second] }), { type: 'SET_DUE_DAY', id: 'first', days: 2 });
    expect(next.tasks[0].dueDate).toBe('2026-10-22');
    next = reduce(next, { type: 'REORDER_TASKS', orders: new Map([['second', -1]]) });
    expect(next.tasks.find((item) => item.id === 'second')).toMatchObject({ order: -1, updatedAt: NOW });
  });
});

describe('navigation and saved-view records', () => {
  test('moves lists between folders and reorders root folders and lists together', () => {
    const rootList = list('root', { order: 0, updatedAt: OLD });
    const nested = list('nested', { folderId: 'work', order: 0, updatedAt: OLD });
    const work = folder('work', { order: 1, updatedAt: OLD });
    let next = reduce(state({ lists: [rootList, nested], folders: [work] }), {
      type: 'REORDER_LIST', id: 'root', folderId: 'work', prevId: 'nested', nextId: null,
    });
    expect(next.lists.find((item) => item.id === 'root')).toMatchObject({ folderId: 'work' });

    next = reduce(next, {
      type: 'REORDER_LIST', id: 'root', folderId: null, prevId: null, nextId: 'work',
    });
    expect(next.lists.find((item) => item.id === 'root')?.folderId).toBeNull();
    next = reduce(next, { type: 'REORDER_FOLDER', id: 'work', prevId: null, nextId: 'root' });
    expect(next.folders[0].order).toBeLessThan(next.lists.find((item) => item.id === 'root')!.order);
  });

  test('creates and updates list and folder records', () => {
    let next = reduce(state(), { type: 'ADD_LIST', list: list('l-1', { updatedAt: OLD }) });
    next = reduce(next, { type: 'ADD_FOLDER', folder: folder('f-1', { updatedAt: OLD }) });
    next = reduce(next, { type: 'UPDATE_LIST', id: 'l-1', patch: { name: 'Renamed' } });
    next = reduce(next, { type: 'UPDATE_FOLDER', id: 'f-1', patch: { name: 'Projects' } });
    expect(next.lists[0]).toMatchObject({ name: 'Renamed', updatedAt: NOW });
    expect(next.folders[0]).toMatchObject({ name: 'Projects', updatedAt: NOW });
  });

  test('deleting a list moves tasks to Inbox and tombstones its view preferences', () => {
    const pref = {
      id: 'all:list:l-1', ...DEFAULT_VIEW_OPTIONS, updatedAt: OLD,
    };
    const next = reduce(state({
      tasks: [task('t-1', { listId: 'l-1', updatedAt: OLD })],
      lists: [list('l-1', { updatedAt: OLD })],
      viewPrefs: [pref],
    }), { type: 'DELETE_LIST', id: 'l-1' });
    expect(next.tasks[0]).toMatchObject({ listId: null, updatedAt: NOW });
    expect(next.lists[0]).toMatchObject({ deletedAt: NOW, updatedAt: NOW });
    expect(next.viewPrefs[0]).toMatchObject({ deletedAt: NOW, updatedAt: NOW });
  });

  test('deleting a folder deletes active children but preserves earlier tombstones', () => {
    const alreadyDeleted = list('old', { folderId: 'f-1', deletedAt: OLD, updatedAt: OLD });
    const next = reduce(state({
      tasks: [task('t-1', { listId: 'l-1', updatedAt: OLD }), task('old-task', { listId: 'old', updatedAt: OLD })],
      lists: [list('l-1', { folderId: 'f-1', updatedAt: OLD }), alreadyDeleted],
      folders: [folder('f-1', { updatedAt: OLD })],
      viewPrefs: [{ id: 'today:list:l-1', ...DEFAULT_VIEW_OPTIONS, updatedAt: OLD }],
    }), { type: 'DELETE_FOLDER', id: 'f-1' });
    expect(next.tasks.find((item) => item.id === 't-1')?.listId).toBeNull();
    expect(next.tasks.find((item) => item.id === 'old-task')?.listId).toBe('old');
    expect(next.lists.find((item) => item.id === 'old')).toBe(alreadyDeleted);
    expect(next.folders[0].deletedAt).toBe(NOW);
    expect(next.viewPrefs[0].deletedAt).toBe(NOW);
  });

  test('stores, clears, and revives view arrangements', () => {
    let next = reduce(state(), {
      type: 'SET_ARRANGEMENT', key: 'inbox', sortBy: 'title', groupKey: 'all', ids: ['b', 'a'],
    });
    expect(next.viewPrefs[0].arrangements).toEqual({ title: { all: { b: 0, a: 1024 } } });
    next = reduce(next, { type: 'CLEAR_ARRANGEMENT', key: 'inbox', sortBy: 'title' });
    expect(next.viewPrefs[0].arrangements).toEqual({});
    next = reduce({ ...next, viewPrefs: [{ ...next.viewPrefs[0], deletedAt: OLD }] }, {
      type: 'SET_VIEW_OPTIONS',
      key: 'inbox',
      options: { groupBy: 'tag', sortBy: 'priority', arrangements: {} },
    });
    expect(next.viewPrefs[0]).toMatchObject({ groupBy: 'tag', sortBy: 'priority', deletedAt: undefined });
  });
});

describe('saved filters and dataset transitions', () => {
  const filter: SavedFilter = {
    id: 'sf-1', name: 'Soon', order: 0, criteria: { query: '', listIds: [], folderIds: [], tags: [], due: ['today'], status: 'active' }, updatedAt: OLD,
  };

  test('adds, updates, and soft-deletes saved filters', () => {
    let next = reduce(state(), { type: 'ADD_SAVED_FILTER', filter });
    next = reduce(next, { type: 'UPDATE_SAVED_FILTER', id: 'sf-1', patch: { name: 'Today' } });
    expect(next.savedFilters[0]).toMatchObject({ name: 'Today', updatedAt: NOW });
    next = reduce(next, { type: 'DELETE_SAVED_FILTER', id: 'sf-1' });
    expect(next.savedFilters[0]).toMatchObject({ deletedAt: NOW, updatedAt: NOW });
  });

  test('connect, sample, disconnect, and token changes reset only their owned state', () => {
    const populated = state({
      tasks: [task('t-1')], lists: [list('l-1')], folders: [folder('f-1')],
      viewPrefs: [{ id: 'inbox', ...DEFAULT_VIEW_OPTIONS, updatedAt: OLD }], savedFilters: [filter],
    });
    const signedIn = reduce(populated, { type: 'SET_TOKEN', token: 'replacement' });
    expect(signedIn.tasks).toBe(populated.tasks);
    expect(signedIn.token).toBe('replacement');

    const connected = reduce(populated, { type: 'CONNECT', serverUrl: 'https://new.test', token: 'new' });
    expect(connected).toMatchObject({ mode: 'server', serverUrl: 'https://new.test', token: 'new' });
    expect(connected.tasks).toEqual([]);

    const sampleTask = task('sample');
    const sample = reduce(connected, {
      type: 'USE_SAMPLE_DATA', data: { tasks: [sampleTask], lists: [], folders: [] },
    });
    expect(sample).toMatchObject({ mode: 'sample', serverUrl: '', token: '' });
    expect(sample.tasks).toEqual([expect.objectContaining({ id: 'sample', updatedAt: NOW })]);

    const disconnected = reduce(sample, { type: 'DISCONNECT' });
    expect(disconnected).toMatchObject({ mode: 'none', serverUrl: '', token: '' });
    expect(disconnected.tasks).toEqual([]);
  });

  test('hydrate keeps server timestamps and merge preserves dirty rows while dropping removed ones', () => {
    const local = task('local', { title: 'Local', updatedAt: OLD });
    const gone = task('gone', { updatedAt: OLD });
    const base = state({ tasks: [local, gone] });
    const hydrated = reduce(base, {
      type: 'HYDRATE',
      tasks: [task('server', { updatedAt: '2026-10-15T00:00:00.000Z' })],
      lists: [], folders: [], viewPrefs: [], savedFilters: [],
    });
    expect(hydrated.tasks[0].updatedAt).toBe('2026-10-15T00:00:00.000Z');

    const merged = reduce(base, {
      type: 'MERGE',
      dirtyIds: new Set(['local']),
      tasks: [task('local', { title: 'Server', updatedAt: NOW })],
      lists: [], folders: [], viewPrefs: [], savedFilters: [],
      removed: { tasks: ['gone'], lists: [] },
    });
    expect(merged.tasks).toEqual([local]);

    const emptyMerge = reduce(merged, {
      type: 'MERGE', dirtyIds: new Set(), tasks: [], lists: [], folders: [], viewPrefs: [], savedFilters: [],
    });
    expect(emptyMerge).toBe(merged);
  });
});

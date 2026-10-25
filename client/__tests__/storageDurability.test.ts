const mockAsyncData: Record<string, string> = {};
const mockSecureData: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, mockAsyncData[key] ?? null])),
  getItem: jest.fn(async (key: string) => mockAsyncData[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncData[key] = value;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete mockAsyncData[key];
  }),
}));

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (key: string) => mockSecureData[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureData[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureData[key];
  }),
}));

import { DEFAULT_ACCENT } from '../src/theme/colors';
import { EMPTY_CRITERIA } from '../src/data/taskFilter';
import { folder, list, task } from '../test/fixtures';

type Storage = typeof import('../src/data/storage');

async function fresh(initial: Record<string, unknown> = {}): Promise<Storage> {
  for (const key of Object.keys(mockAsyncData)) delete mockAsyncData[key];
  for (const key of Object.keys(mockSecureData)) delete mockSecureData[key];
  for (const [key, value] of Object.entries(initial)) {
    mockAsyncData[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  jest.resetModules();
  const storage = require('../src/data/storage') as Storage;
  await storage.initStorage();
  return storage;
}

describe('primitive settings', () => {
  test('infers an old server connection and round-trips connection settings', async () => {
    const storage = await fresh({ 'yarukoto.serverUrl': 'https://old-server.test' });
    expect(storage.loadMode()).toBe('server');
    expect(storage.loadServerUrl()).toBe('https://old-server.test');

    storage.saveMode('sample');
    storage.saveServerUrl('https://new-server.test');
    storage.saveToken('secret');
    expect(storage.loadMode()).toBe('sample');
    expect(storage.loadServerUrl()).toBe('https://new-server.test');
    expect(storage.loadToken()).toBe('secret');

    storage.saveMode('none');
    storage.clearServerUrl();
    storage.clearToken();
    expect(storage.loadMode()).toBe('none');
    expect(storage.loadServerUrl()).toBe('');
    expect(storage.loadToken()).toBe('');
  });

  test('rejects obsolete appearance values and saves valid choices', async () => {
    const storage = await fresh({
      'yarukoto.accent': '#not-in-the-palette',
      'yarukoto.scheme': 'sepia',
    });
    expect(storage.loadAccent()).toBe(DEFAULT_ACCENT);
    expect(storage.loadScheme()).toBe('system');

    storage.saveAccent('#1E7A3C');
    storage.saveScheme('dark');
    expect(storage.loadAccent()).toBe('#1E7A3C');
    expect(storage.loadScheme()).toBe('dark');
  });
});

describe('device-local view state', () => {
  test('normalizes each plan preference independently', async () => {
    const storage = await fresh({
      'yarukoto.planPrefs': {
        mode: 'invalid',
        rangeDays: 2,
        sort: 'priority',
        calendarOrder: { '2026-10-20': ['a', 3, 'b'], bad: 'not-an-array' },
        showCompleted: true,
        weekView: 'yes',
        planPane: 'no',
      },
    });
    expect(storage.loadPlanPrefs()).toEqual({
      mode: 'day',
      rangeDays: 2,
      sort: 'priority',
      calendarOrder: { '2026-10-20': ['a', 'b'] },
      showCompleted: true,
      weekView: false,
      planPane: true,
    });

    const next = { ...storage.DEFAULT_PLAN_PREFS, mode: 'week' as const, weekView: true, planPane: false };
    storage.savePlanPrefs(next);
    expect(storage.loadPlanPrefs()).toEqual(next);
  });

  test('remembers how many days Today covers, and ignores anything else', async () => {
    expect((await fresh({})).loadTodayDays()).toBe(3);
    expect((await fresh({ 'yarukoto.todayDays': 5 })).loadTodayDays()).toBe(3);
    const storage = await fresh({ 'yarukoto.todayDays': 1 });
    expect(storage.loadTodayDays()).toBe(1);
    storage.saveTodayDays(7);
    expect(storage.loadTodayDays()).toBe(7);
  });

  test('remembers the desktop text size, and reads anything unusable as the default', async () => {
    expect((await fresh({})).loadTextScale()).toBe(1);
    expect((await fresh({ 'yarukoto.textScale': 'big' })).loadTextScale()).toBe(1);
    expect((await fresh({ 'yarukoto.textScale': '-2' })).loadTextScale()).toBe(1);
    const storage = await fresh({ 'yarukoto.textScale': '1.3' });
    expect(storage.loadTextScale()).toBe(1.3);
    storage.saveTextScale(1.5);
    expect(storage.loadTextScale()).toBe(1.5);
    expect(mockAsyncData['yarukoto.textScale']).toBe('1.5');
    storage.saveTextScale(1);
    expect(storage.loadTextScale()).toBe(1);
  });

  test('validates collapsed groups and removes default entries', async () => {
    const storage = await fresh({
      'yarukoto.collapsedSections': {
        inbox: { groups: ['today', 4], completed: false },
      },
      'yarukoto.collapsedFolders': ['f-1', 9, 'f-2'],
    });
    expect(storage.loadCollapsedSections('inbox')).toEqual({ groups: ['today'], completed: false });
    expect(storage.loadCollapsedSections('other')).toBe(storage.DEFAULT_COLLAPSED_SECTIONS);
    expect(storage.loadCollapsedFolders()).toEqual(['f-1', 'f-2']);

    storage.saveCollapsedSections('inbox', storage.DEFAULT_COLLAPSED_SECTIONS);
    storage.saveCollapsedFolders([]);
    expect(storage.loadCollapsedSections('inbox')).toBe(storage.DEFAULT_COLLAPSED_SECTIONS);
    expect(storage.loadCollapsedFolders()).toEqual([]);
    expect(mockAsyncData['yarukoto.collapsedFolders']).toBeUndefined();
  });

  test('keeps one current credential per saved server', async () => {
    const storage = await fresh({
      'yarukoto.savedServers': [
        { url: 'https://one.test', token: 'old' },
        { url: 'https://two.test', token: 'two' },
      ],
    });
    storage.addSavedServer('https://one.test', 'new');
    expect(storage.loadSavedServers()).toEqual([
      { url: 'https://one.test', token: 'new' },
      { url: 'https://two.test', token: 'two' },
    ]);
    storage.removeSavedServer('https://one.test');
    expect(storage.loadSavedServers()).toEqual([{ url: 'https://two.test', token: 'two' }]);
  });

  test('scopes and validates the first-tab destination by workspace', async () => {
    const storage = await fresh({
      'yarukoto.firstTabViews': {
        schemaVersion: 1,
        workspaces: {
          sample: { kind: 'tag', value: 'home' },
          broken: { kind: 'list', id: 7 },
        },
      },
    });
    expect(storage.firstTabWorkspace('server', 'https://tasks.test///')).toBe('server:https://tasks.test');
    expect(storage.firstTabWorkspace('sample', '')).toBe('sample');
    expect(storage.loadSavedFirstTabView('sample')).toEqual({ kind: 'tag', value: 'home' });
    expect(storage.loadSavedFirstTabView('broken')).toBeNull();

    storage.saveFirstTabView('server:https://tasks.test', { kind: 'list', id: 'l-1' });
    expect(storage.loadSavedFirstTabView('server:https://tasks.test')).toEqual({ kind: 'list', id: 'l-1' });
    storage.clearSavedFirstTabView('server:https://tasks.test');
    expect(storage.loadSavedFirstTabView('server:https://tasks.test')).toBeNull();
    storage.clearSavedFirstTabView('missing');
  });

  test('drops empty browse criteria and normalizes stored fields', async () => {
    const storage = await fresh({
      'yarukoto.browseCriteria': {
        query: ' bill ', tags: ['finance', 3], listIds: [], folderIds: [], due: ['today', 'bad'], status: 'active',
      },
    });
    expect(storage.loadBrowseCriteria()).toMatchObject({
      query: ' bill ', tags: ['finance'], due: ['today'], status: 'active',
    });
    storage.saveBrowseCriteria(EMPTY_CRITERIA);
    expect(storage.loadBrowseCriteria()).toEqual(EMPTY_CRITERIA);
    expect(mockAsyncData['yarukoto.browseCriteria']).toBeUndefined();
  });
});

describe('sync durability', () => {
  const baseSnapshot = {
    schemaVersion: 1,
    tasks: [task('t-1')],
    lists: [list('l-1')],
    folders: [folder('f-1')],
    viewPrefs: [{ id: 'inbox', groupBy: 'none', sortBy: 'manual', updatedAt: 'now' }],
  };

  test('loads old snapshots without inventing a known feature set', async () => {
    const storage = await fresh({ 'yarukoto.serverSnapshot': baseSnapshot });
    expect(storage.loadServerSnapshot()).toMatchObject({
      ...baseSnapshot,
      savedFilters: [],
      serverFeatures: undefined,
      household: undefined,
      cursor: undefined,
      savedAt: '1970-01-01T00:00:00.000Z',
    });
  });

  test('preserves an explicitly unsupported feature set and filters unknown ids', async () => {
    let storage = await fresh({
      'yarukoto.serverSnapshot': { ...baseSnapshot, serverFeatures: [], cursor: 'c-1', savedAt: 'saved' },
    });
    expect(storage.loadServerSnapshot()?.serverFeatures).toEqual([]);

    storage = await fresh({
      'yarukoto.serverSnapshot': {
        ...baseSnapshot,
        serverFeatures: ['taskReminders', 'futureFeature'],
        household: { me: null, deviceId: 'd-1', members: [{ id: 'u-1', name: 'Alex' }, { id: 2 }] },
      },
    });
    expect(storage.loadServerSnapshot()).toMatchObject({
      serverFeatures: ['taskReminders'],
      household: { me: null, deviceId: 'd-1', members: [{ id: 'u-1', name: 'Alex' }] },
    });
  });

  test.each([
    null,
    { ...baseSnapshot, schemaVersion: 2 },
    { ...baseSnapshot, tasks: [{ title: 'missing id' }] },
    { ...baseSnapshot, lists: 'not-an-array' },
  ])('rejects an unusable snapshot %#', async (snapshot) => {
    const storage = await fresh(snapshot ? { 'yarukoto.serverSnapshot': snapshot } : {});
    expect(storage.loadServerSnapshot()).toBeNull();
  });

  test('stamps saved snapshots and clears them', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    const storage = await fresh();
    storage.saveServerSnapshot({
      tasks: [], lists: [], folders: [], viewPrefs: [], savedFilters: [], serverFeatures: [],
    });
    expect(storage.loadServerSnapshot()).toMatchObject({
      schemaVersion: 1,
      savedAt: '2026-10-20T12:00:00.000Z',
      serverFeatures: [],
    });
    storage.clearServerSnapshot();
    expect(storage.loadServerSnapshot()).toBeNull();
    jest.useRealTimers();
  });

  test('filters dirty ids and durable snoozes, removing empty stores', async () => {
    const storage = await fresh({
      'yarukoto.dirtyIds': ['t-1', 4, 'l-1'],
      'yarukoto.snoozedReminders': [
        { taskId: 't-1', reminderId: 'r-1', fireAt: '2026-10-20T13:00:00.000Z' },
        { taskId: 4, reminderId: 'r-2', fireAt: '2026-10-20T13:00:00.000Z' },
        { taskId: 't-2', reminderId: 'r-2', fireAt: 'invalid' },
      ],
    });
    expect(storage.loadDirtyIds()).toEqual(['t-1', 'l-1']);
    expect(storage.loadSnoozes()).toEqual([
      { taskId: 't-1', reminderId: 'r-1', fireAt: '2026-10-20T13:00:00.000Z' },
    ]);

    storage.saveDirtyIds([]);
    storage.saveSnoozes([]);
    expect(storage.loadDirtyIds()).toEqual([]);
    expect(storage.loadSnoozes()).toEqual([]);
    storage.clearDirtyIds();
  });
});

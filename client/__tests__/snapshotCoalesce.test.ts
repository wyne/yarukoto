/**
 * The store is one AsyncStorage value, so a write costs the whole dataset. These
 * cover the three things that make it dangerous to defer: that a burst really does
 * collapse to one write of the *final* state, that nothing is left queued when
 * the app goes away (including a save that arrives after the background flush), and that what lands on disk still reads back — including the
 * distinction between a server that was never probed and one that answered with
 * no optional features.
 */
const mockAsyncData: Record<string, string> = {};
const writes: { key: string; value: string }[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: async (keys: string[]) => keys.map((k) => [k, mockAsyncData[k] ?? null]),
  getItem: async (k: string) => mockAsyncData[k] ?? null,
  setItem: async (k: string, v: string) => {
    writes.push({ key: k, value: v });
    mockAsyncData[k] = v;
  },
  removeItem: async (k: string) => {
    delete mockAsyncData[k];
  },
}));

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

const SNAPSHOT_KEY = 'yarukoto.serverSnapshot';

type Storage = typeof import('../src/data/storage');

async function freshStorage(): Promise<Storage> {
  for (const k of Object.keys(mockAsyncData)) delete mockAsyncData[k];
  writes.length = 0;
  jest.resetModules();
  const storage: Storage = require('../src/data/storage');
  await storage.initStorage();
  return storage;
}

function task(id: string, completed = false) {
  return {
    id,
    title: `Task ${id}`,
    notes: '',
    priority: 'none' as const,
    listId: null,
    tags: [],
    subtasks: [],
    completed,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    order: 0,
  };
}

function payload(overrides: Partial<Parameters<Storage['saveServerSnapshot']>[0]> = {}) {
  return {
    tasks: [task('t-1')],
    lists: [],
    folders: [],
    viewPrefs: [],
    savedFilters: [],
    cursor: 'cursor-1',
    ...overrides,
  };
}

const snapshotWrites = () => writes.filter((w) => w.key === SNAPSHOT_KEY);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('a burst of edits costs one write, of the last state', async () => {
  const storage = await freshStorage();

  for (let i = 0; i < 12; i += 1) {
    storage.saveServerSnapshot(payload({ tasks: [task('t-1', i % 2 === 0)], cursor: `cursor-${i}` }));
  }
  expect(snapshotWrites()).toHaveLength(0);

  jest.runOnlyPendingTimers();

  expect(snapshotWrites()).toHaveLength(1);
  const written = JSON.parse(snapshotWrites()[0].value);
  expect(written.cursor).toBe('cursor-11');
  expect(written.tasks[0].completed).toBe(false);
});

test('a queued write is still the snapshot a reader sees', async () => {
  const storage = await freshStorage();

  storage.saveServerSnapshot(payload({ cursor: 'cursor-queued' }));
  expect(snapshotWrites()).toHaveLength(0);
  expect(storage.loadServerSnapshot()?.cursor).toBe('cursor-queued');
});

test('flushing persists the final state without waiting out the window', async () => {
  const storage = await freshStorage();

  storage.saveServerSnapshot(payload({ tasks: [task('t-1')], cursor: 'cursor-1' }));
  storage.saveServerSnapshot(payload({ tasks: [task('t-1'), task('t-2')], cursor: 'cursor-2' }));
  storage.flushServerSnapshot();

  expect(snapshotWrites()).toHaveLength(1);
  const written = JSON.parse(snapshotWrites()[0].value);
  expect(written.cursor).toBe('cursor-2');
  expect(written.tasks.map((t: { id: string }) => t.id)).toEqual(['t-1', 't-2']);

  // Nothing left behind: the timer that was armed must not write a second time.
  jest.runOnlyPendingTimers();
  expect(snapshotWrites()).toHaveLength(1);
});

test('a snapshot saved after the background flush is written at once', async () => {
  const storage = await freshStorage();
  const { AppState } = require('react-native');
  const previous = AppState.currentState;

  try {
    // 1. An edit is queued, then the app is backgrounded and the provider flushes.
    storage.saveServerSnapshot(payload({ cursor: 'cursor-before-background' }));
    AppState.currentState = 'background';
    storage.flushServerSnapshot();
    expect(snapshotWrites()).toHaveLength(1);

    // 2. A sync that was already in flight finishes and the store saves again.
    storage.saveServerSnapshot(payload({ tasks: [task('t-1'), task('t-synced')], cursor: 'cursor-after-sync' }));

    // 3. No timer may be left to fire: the OS can suspend the process before it does.
    expect(jest.getTimerCount()).toBe(0);
    expect(snapshotWrites()).toHaveLength(2);
    const written = JSON.parse(snapshotWrites()[1].value);
    expect(written.cursor).toBe('cursor-after-sync');
    expect(written.tasks.some((t: { id: string }) => t.id === 't-synced')).toBe(true);

    // Back in the foreground, edits coalesce again.
    AppState.currentState = 'active';
    storage.saveServerSnapshot(payload({ cursor: 'cursor-foreground' }));
    expect(snapshotWrites()).toHaveLength(2);
    jest.runOnlyPendingTimers();
    expect(snapshotWrites()).toHaveLength(3);
  } finally {
    AppState.currentState = previous;
  }
});

test('flushing with nothing queued writes nothing', async () => {
  const storage = await freshStorage();

  storage.flushServerSnapshot();
  expect(snapshotWrites()).toHaveLength(0);
});

test('rows and the cursor it was given always land together', async () => {
  const storage = await freshStorage();

  // Whichever call wins the coalesce, the cursor written is the one that came
  // with those rows — never a newer cursor against rows from before a merge.
  storage.saveServerSnapshot(payload({ tasks: [task('t-1')], cursor: 'before-merge' }));
  storage.saveServerSnapshot(payload({ tasks: [task('t-1'), task('t-merged')], cursor: 'after-merge' }));
  jest.runOnlyPendingTimers();

  const written = JSON.parse(snapshotWrites()[0].value);
  expect(written.cursor).toBe('after-merge');
  expect(written.tasks.some((t: { id: string }) => t.id === 't-merged')).toBe(true);
});

test('disconnecting drops a queued write instead of letting it land after', async () => {
  const storage = await freshStorage();

  storage.saveServerSnapshot(payload());
  storage.clearServerSnapshot();
  jest.runOnlyPendingTimers();

  expect(snapshotWrites()).toHaveLength(0);
  expect(storage.loadServerSnapshot()).toBeNull();
});

test('a coalesced snapshot still round-trips through loadServerSnapshot', async () => {
  const storage = await freshStorage();

  storage.saveServerSnapshot(
    payload({
      tasks: [task('t-1', true)],
      lists: [{ id: 'l-1', name: 'Home', color: '#fff', folderId: null, order: 0, updatedAt: '2026-10-01T09:00:00.000Z' }],
      savedFilters: [],
      serverFeatures: ['savedFilters'],
      cursor: 'cursor-round-trip',
    })
  );
  jest.runOnlyPendingTimers();

  // Re-read the written value the way a cold start does, not the queued object.
  const reloaded = await freshStorageWith(snapshotWrites()[0].value);
  const snapshot = reloaded.loadServerSnapshot();
  expect(snapshot).not.toBeNull();
  expect(snapshot?.schemaVersion).toBe(1);
  expect(snapshot?.tasks[0].id).toBe('t-1');
  expect(snapshot?.lists[0].name).toBe('Home');
  expect(snapshot?.savedFilters).toEqual([]);
  expect(snapshot?.serverFeatures).toEqual(['savedFilters']);
  expect(snapshot?.cursor).toBe('cursor-round-trip');
  expect(snapshot?.savedAt).toEqual(expect.any(String));
});

test('a probed-but-featureless server stays distinct from one never probed', async () => {
  const storage = await freshStorage();

  storage.saveServerSnapshot(payload({ serverFeatures: [] }));
  jest.runOnlyPendingTimers();
  const probed = await freshStorageWith(snapshotWrites()[0].value);
  expect(probed.loadServerSnapshot()?.serverFeatures).toEqual([]);

  const unprobed = await freshStorage();
  unprobed.saveServerSnapshot(payload({ serverFeatures: undefined }));
  jest.runOnlyPendingTimers();
  const reloaded = await freshStorageWith(snapshotWrites()[0].value);
  expect(reloaded.loadServerSnapshot()?.serverFeatures).toBeUndefined();
});

test('a snapshot written by the shipped build still loads', async () => {
  // Byte-for-byte what the un-coalesced version wrote, so an update finds the
  // store it left behind rather than a blind cold start.
  const shipped = JSON.stringify({
    schemaVersion: 1,
    tasks: [task('t-old')],
    lists: [],
    folders: [],
    viewPrefs: [],
    savedFilters: [],
    serverFeatures: ['taskReminders'],
    cursor: 'cursor-shipped',
    savedAt: '2026-10-01T09:00:00.000Z',
  });

  const storage = await freshStorageWith(shipped);
  const snapshot = storage.loadServerSnapshot();
  expect(snapshot?.tasks[0].id).toBe('t-old');
  expect(snapshot?.serverFeatures).toEqual(['taskReminders']);
  expect(snapshot?.cursor).toBe('cursor-shipped');
  expect(snapshot?.savedAt).toBe('2026-10-01T09:00:00.000Z');
});

async function freshStorageWith(raw: string): Promise<Storage> {
  for (const k of Object.keys(mockAsyncData)) delete mockAsyncData[k];
  mockAsyncData[SNAPSHOT_KEY] = raw;
  writes.length = 0;
  jest.resetModules();
  const storage: Storage = require('../src/data/storage');
  await storage.initStorage();
  return storage;
}

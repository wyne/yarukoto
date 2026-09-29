import { Api, SyncBatch, SyncPush, codeFromPairingLink, pairingLink } from '../src/data/api';
import { Outbox, dropRemoved, pushDirty } from '../src/data/sync';
import { Household, ownsList, parseHousehold } from '../src/data/household';
import { ListDef, ServerFeature, Task } from '../src/data/types';

const task: Task = {
  id: 't-1',
  title: 'Take the bins out',
  notes: '',
  priority: 'none',
  listId: 'l-home',
  assigneeId: 'u-kid',
  tags: [],
  subtasks: [],
  completed: false,
  createdAt: '2026-09-28T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
  order: 0,
};

const list: ListDef = {
  id: 'l-home',
  name: 'Home',
  color: '#000',
  folderId: null,
  order: 0,
  shared: true,
  ownerId: 'u-owner',
  updatedAt: '2026-09-28T00:00:00.000Z',
};

const household: Household = {
  me: { id: 'u-kid', name: 'Kid', role: 'member', createdAt: '2026-09-28T00:00:00.000Z' },
  deviceId: 'd-1',
  members: [],
};

function fakeApi(sent: SyncPush[]): Api {
  const empty: SyncBatch = {
    now: '',
    tasks: [],
    lists: [],
    folders: [],
    viewPrefs: [],
    savedFilters: [],
    removed: { tasks: [], lists: [] },
  };
  return {
    push: async (batch: SyncPush) => {
      sent.push(batch);
      return empty;
    },
  } as Partial<Api> as Api;
}

async function push(features: readonly ServerFeature[]) {
  const sent: SyncPush[] = [];
  await pushDirty(
    fakeApi(sent),
    new Outbox([task.id, list.id]),
    { tasks: [task], lists: [list], folders: [], viewPrefs: [], savedFilters: [] },
    new Set(),
    features
  );
  return sent[0];
}

test('a household server is sent sharing and assignees, never the owner', async () => {
  const sent = await push(['household']);
  expect(sent.tasks?.[0].assigneeId).toBe('u-kid');
  expect(sent.lists?.[0].shared).toBe(true);
  expect(sent.lists?.[0]).not.toHaveProperty('ownerId');
});

test('a server without households is not sent fields it cannot keep', async () => {
  const sent = await push([]);
  expect(sent.tasks?.[0]).not.toHaveProperty('assigneeId');
  expect(sent.lists?.[0]).not.toHaveProperty('shared');
});

test('rows the server says are gone are dropped, and nothing else changes', () => {
  const rows = [{ id: 'a' }, { id: 'b' }];
  expect(dropRemoved(rows, ['b'])).toEqual([{ id: 'a' }]);
  expect(dropRemoved(rows, [])).toBe(rows);
  expect(dropRemoved(rows, ['zzz'])).toBe(rows);
});

test('only the owner owns a list, and lists from before households are everyone’s own', () => {
  expect(ownsList(list, household)).toBe(false);
  expect(ownsList({ ...list, ownerId: 'u-kid' }, household)).toBe(true);
  expect(ownsList({ ...list, ownerId: undefined }, household)).toBe(true);
  expect(ownsList(list, null)).toBe(true);
});

test('a stored household is checked rather than trusted', () => {
  expect(parseHousehold(null)).toBeUndefined();
  expect(parseHousehold({ members: 'nope' })).toBeUndefined();
  expect(parseHousehold({ me: null, members: [{ id: 'u-1', name: 'A' }, { id: 3 }] })).toEqual({
    me: null,
    deviceId: null,
    members: [{ id: 'u-1', name: 'A' }],
  });
});

test('a sign-in QR round-trips its code, and other links are ignored', () => {
  expect(codeFromPairingLink(pairingLink('K7QM-3XPA'))).toBe('K7QM-3XPA');
  expect(codeFromPairingLink('yarukoto://other?code=K7QM-3XPA')).toBeNull();
  expect(codeFromPairingLink('https://example.com/pair?code=K7QM-3XPA')).toBeNull();
});

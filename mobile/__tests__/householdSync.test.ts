import { Api, SyncBatch, SyncPush, createApi, codeFromPairingLink, joinLink, pairingLink, parseJoinLink, signedOutReason } from '../src/data/api';
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

test('a join QR carries the server and the sign-in, and survives awkward characters', () => {
  const link = joinLink('http://192.168.86.145:8080', { pairingId: 'p-1', secret: 'a+b/c=d_e-f' });
  expect(parseJoinLink(link)).toEqual({
    serverUrl: 'http://192.168.86.145:8080',
    pairing: { pairingId: 'p-1', secret: 'a+b/c=d_e-f' },
  });
  expect(parseJoinLink('yarukoto://join?server=ftp://x&pairing=p&secret=s')).toBeNull();
  expect(parseJoinLink('yarukoto://join?server=http://x&pairing=p')).toBeNull();
  expect(parseJoinLink(pairingLink('ABCD-2345'))).toBeNull();
});

test('a request without a body claims no JSON content type', async () => {
  const calls: RequestInit[] = [];
  const realFetch = global.fetch;
  global.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    return { ok: true, status: 200, json: async () => ({ device: {}, member: {} }) } as Response;
  }) as typeof fetch;
  try {
    const api = createApi('http://server', 'tok');
    await api.revokeDevice('d-1');
    await api.renameMember('u-1', 'Alex');
  } finally {
    global.fetch = realFetch;
  }
  expect(calls[0].headers).not.toHaveProperty('Content-Type');
  expect(calls[1].headers).toHaveProperty('Content-Type', 'application/json');
});

test('a refused token says whether the device was signed out or just not recognised', async () => {
  const realFetch = global.fetch;
  const refuse = (body: unknown) =>
    (global.fetch = (async () => ({ ok: false, status: 401, json: async () => body }) as Response) as typeof fetch);
  const reasonFor = async () => {
    try {
      await createApi('http://server', 'tok').me();
      return null;
    } catch (err) {
      return signedOutReason(err);
    }
  };
  try {
    refuse({ error: 'signed_out' });
    expect(await reasonFor()).toBe('signed_out');
    refuse({ error: 'unauthorized' });
    expect(await reasonFor()).toBe('rejected');
    // A server from before the distinction, or a proxy, may say nothing at all.
    global.fetch = (async () => ({ ok: false, status: 401, json: async () => Promise.reject(new Error('html')) }) as Response) as typeof fetch;
    expect(await reasonFor()).toBe('rejected');
  } finally {
    global.fetch = realFetch;
  }
  expect(signedOutReason(new Error('offline'))).toBeNull();
});

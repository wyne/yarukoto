import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { ListDef, Task } from '../../shared/types';
import { runMigrations } from '../src/db';
import { registerHouseholdRoutes, registerPairingRoutes } from '../src/routes/household';
import { registerHistoryRoutes } from '../src/routes/history';
import { registerSyncRoutes } from '../src/routes/sync';
import { registerTaskRoutes } from '../src/routes/tasks';
import { PAIRING_TTL_MS, startPairing, pollPairing } from '../src/household';
import { authedApp, OWNER_AUTH } from './helpers';

const T0 = '2026-09-01T00:00:00.000Z';

function task(id: string, fields: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    notes: '',
    priority: 'none',
    listId: null,
    tags: [],
    subtasks: [],
    completed: false,
    createdAt: T0,
    updatedAt: T0,
    order: 0,
    ...fields,
  };
}

function list(id: string, fields: Partial<ListDef> = {}): ListDef {
  return { id, name: id, color: '#888', folderId: null, order: 0, updatedAt: T0, ...fields };
}

async function household() {
  const db = new Database(':memory:');
  runMigrations(db);
  const app = authedApp(db);
  registerSyncRoutes(app, db);
  registerTaskRoutes(app, db);
  registerHistoryRoutes(app, db);
  registerHouseholdRoutes(app, db);
  // Pairing start and poll sit outside auth in index.ts; here they sit behind
  // it only in the sense that the hook rejects them, so give them their own app.
  const open = (await import('fastify')).default();
  registerPairingRoutes(open, db);
  await app.ready();
  await open.ready();

  /** Pairs a device the way a phone would: start, approve, poll. */
  async function pair(approver: Record<string, string>, as: 'self' | 'member' | 'integration', name?: string) {
    const started = (await open.inject({ method: 'POST', url: '/api/v1/pair/start', payload: { name: 'Phone' } })).json();
    assert.match(started.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const pending = await open.inject({
      method: 'POST',
      url: '/api/v1/pair/poll',
      payload: { pairingId: started.pairingId, secret: started.secret },
    });
    assert.deepEqual(pending.json(), { status: 'pending' });

    const approved = await app.inject({
      headers: approver,
      method: 'POST',
      url: '/api/v1/pair/approve',
      // Typed the way a person would: lowercase, no dash.
      payload: { code: started.code.replace('-', '').toLowerCase(), as, name },
    });
    assert.equal(approved.statusCode, 200, approved.body);

    const claimed = (
      await open.inject({ method: 'POST', url: '/api/v1/pair/poll', payload: { pairingId: started.pairingId, secret: started.secret } })
    ).json();
    assert.equal(claimed.status, 'approved');
    // A claim happens once.
    const again = await open.inject({
      method: 'POST',
      url: '/api/v1/pair/poll',
      payload: { pairingId: started.pairingId, secret: started.secret },
    });
    assert.equal(again.statusCode, 404);
    return { auth: { authorization: `Bearer ${claimed.token}` }, member: claimed.member, deviceId: approved.json().device.id };
  }

  const sync = async (auth: Record<string, string>, since?: string) =>
    (await app.inject({ headers: auth, method: 'GET', url: `/api/v1/sync${since ? `?since=${since}` : ''}` })).json();
  const push = async (auth: Record<string, string>, payload: object) =>
    (await app.inject({ headers: auth, method: 'POST', url: '/api/v1/sync', payload })).json();

  return { db, app, open, pair, sync, push };
}

test('a new person joins by code and sees only shared lists and their own Inbox', async () => {
  const h = await household();
  await h.push(OWNER_AUTH, {
    lists: [list('l-private'), list('l-family', { shared: true })],
    tasks: [
      task('t-mine', { listId: null }),
      task('t-secret', { listId: 'l-private' }),
      task('t-groceries', { listId: 'l-family' }),
    ],
  });

  const alex = await h.pair(OWNER_AUTH, 'member', 'Alex');
  assert.equal(alex.member.name, 'Alex');
  assert.equal(alex.member.role, 'member');

  const pulled = await h.sync(alex.auth);
  assert.deepEqual(pulled.lists.map((l: ListDef) => l.id), ['l-family']);
  assert.deepEqual(pulled.tasks.map((t: Task) => t.id), ['t-groceries']);

  // Alex's own Inbox task is Alex's alone.
  await h.push(alex.auth, { tasks: [task('t-alex', { listId: null })] });
  const owner = await h.sync(OWNER_AUTH);
  assert.ok(!owner.tasks.some((t: Task) => t.id === 't-alex'));
  assert.ok((await h.sync(alex.auth)).tasks.some((t: Task) => t.id === 't-alex'));

  // The task API and history follow the same rule.
  const rest = await h.app.inject({ headers: alex.auth, method: 'GET', url: '/api/v1/tasks/t-secret' });
  assert.equal(rest.statusCode, 404);
  const activity = (await h.app.inject({ headers: alex.auth, method: 'GET', url: '/api/v1/activity' })).json();
  assert.ok(activity.revisions.every((r: { taskId: string }) => ['t-groceries', 't-alex'].includes(r.taskId)));
});

test('a push touching what the pusher cannot see is dropped', async () => {
  const h = await household();
  await h.push(OWNER_AUTH, {
    lists: [list('l-private'), list('l-family', { shared: true, folderId: 'f-home', order: 3 })],
    folders: [{ id: 'f-home', name: 'Home', order: 0, updatedAt: T0 }],
    tasks: [task('t-secret', { listId: 'l-private' }), task('t-milk', { listId: 'l-family' })],
  });
  const alex = await h.pair(OWNER_AUTH, 'member', 'Alex');
  const later = '2026-09-02T00:00:00.000Z';

  const result = await h.push(alex.auth, {
    tasks: [
      task('t-secret', { listId: 'l-private', title: 'hacked', updatedAt: later }),
      task('t-new', { listId: 'l-private', updatedAt: later }),
    ],
    lists: [list('l-private', { name: 'mine now', updatedAt: later })],
    folders: [{ id: 'f-home', name: 'Taken', order: 0, updatedAt: later }],
  });
  assert.deepEqual(result.tasks, []);
  assert.deepEqual(result.lists, []);
  assert.deepEqual(result.folders, []);
  const stored = h.db.prepare("SELECT title FROM tasks WHERE id = 't-secret'").get() as { title: string };
  assert.equal(stored.title, 't-secret');
  assert.equal(h.db.prepare("SELECT 1 FROM tasks WHERE id = 't-new'").get(), undefined);

  // Someone else's shared list: its name is editable, its sharing, folder and
  // position are not — and it sits at the root of their nav.
  const pulled = await h.sync(alex.auth);
  const family = pulled.lists.find((l: ListDef) => l.id === 'l-family');
  assert.equal(family.folderId, null);
  await h.push(alex.auth, {
    lists: [{ ...family, name: 'Family', shared: false, order: 99, updatedAt: later }],
  });
  const row = h.db.prepare("SELECT name, shared, folder_id, order_key FROM lists WHERE id = 'l-family'").get();
  assert.deepEqual({ ...(row as object) }, { name: 'Family', shared: 1, folder_id: 'f-home', order_key: 3 });
});

test('unsharing a list tells everyone else to drop it and its tasks', async () => {
  const h = await household();
  await h.push(OWNER_AUTH, {
    lists: [list('l-family', { shared: true })],
    tasks: [task('t-milk', { listId: 'l-family' })],
  });
  const alex = await h.pair(OWNER_AUTH, 'member', 'Alex');
  const first = await h.sync(alex.auth);
  assert.equal(first.tasks.length, 1);

  await h.push(OWNER_AUTH, { lists: [list('l-family', { shared: false, updatedAt: '2026-09-03T00:00:00.000Z' })] });
  const next = await h.sync(alex.auth, first.now);
  assert.deepEqual(next.lists, []);
  assert.deepEqual(next.tasks, []);
  assert.deepEqual(next.removed, { lists: ['l-family'], tasks: ['t-milk'] });

  // A client from before households sends no `shared`, and must not unshare.
  await h.push(OWNER_AUTH, { lists: [list('l-family', { shared: true, updatedAt: '2026-09-04T00:00:00.000Z' })] });
  const { shared: _dropped, ...legacy } = list('l-family', { name: 'Renamed', updatedAt: '2026-09-05T00:00:00.000Z' });
  await h.push(OWNER_AUTH, { lists: [legacy] });
  assert.deepEqual(
    { ...(h.db.prepare("SELECT name, shared FROM lists WHERE id = 'l-family'").get() as object) },
    { name: 'Renamed', shared: 1 }
  );
});

test('moving a shared task to your Inbox keeps it yours, and assignees survive legacy pushes', async () => {
  const h = await household();
  await h.push(OWNER_AUTH, { lists: [list('l-family', { shared: true })], tasks: [task('t-milk', { listId: 'l-family' })] });
  const alex = await h.pair(OWNER_AUTH, 'member', 'Alex');

  await h.push(OWNER_AUTH, {
    tasks: [task('t-milk', { listId: 'l-family', assigneeId: alex.member.id, updatedAt: '2026-09-02T00:00:00.000Z' })],
  });
  // An older app build pushes the row without `assigneeId`.
  await h.push(OWNER_AUTH, { tasks: [task('t-milk', { listId: 'l-family', title: 'oat milk', updatedAt: '2026-09-03T00:00:00.000Z' })] });
  const synced = (await h.sync(alex.auth)).tasks[0];
  assert.equal(synced.title, 'oat milk');
  assert.equal(synced.assigneeId, alex.member.id);

  await h.push(alex.auth, { tasks: [{ ...synced, listId: null, updatedAt: '2026-09-04T00:00:00.000Z' }] });
  assert.ok((await h.sync(alex.auth)).tasks.some((t: Task) => t.id === 't-milk'));
  assert.ok(!(await h.sync(OWNER_AUTH)).tasks.some((t: Task) => t.id === 't-milk'));
});

test('removing a person signs them out and hides their things; restoring brings it all back', async () => {
  const h = await household();
  const alex = await h.pair(OWNER_AUTH, 'member', 'Alex');
  await h.push(alex.auth, {
    lists: [list('l-alex'), list('l-alex-shared', { shared: true })],
    tasks: [task('t-a', { listId: 'l-alex' }), task('t-s', { listId: 'l-alex-shared' })],
  });
  const before = await h.sync(OWNER_AUTH);
  assert.ok(before.lists.some((l: ListDef) => l.id === 'l-alex-shared'));

  // Only an admin removes people, and not themselves.
  const denied = await h.app.inject({ headers: alex.auth, method: 'DELETE', url: `/api/v1/users/u-owner` });
  assert.equal(denied.statusCode, 403);
  const removed = await h.app.inject({ headers: OWNER_AUTH, method: 'DELETE', url: `/api/v1/users/${alex.member.id}` });
  assert.ok(removed.json().member.deletedAt);

  const signedOut = await h.app.inject({ headers: alex.auth, method: 'GET', url: '/api/v1/me' });
  assert.equal(signedOut.statusCode, 401);
  // Their shared list stays with the household; nothing was deleted.
  assert.equal((h.db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number }).n, 2);
  const admin = (await h.app.inject({ headers: OWNER_AUTH, method: 'GET', url: '/api/v1/household' })).json();
  assert.ok(admin.members.find((m: { id: string }) => m.id === alex.member.id).deletedAt);

  await h.app.inject({ headers: OWNER_AUTH, method: 'POST', url: `/api/v1/users/${alex.member.id}/restore` });
  // Old devices stay signed out; a new pairing as themselves gets it all back.
  assert.equal((await h.app.inject({ headers: alex.auth, method: 'GET', url: '/api/v1/me' })).statusCode, 401);
  const devices = (await h.app.inject({ headers: OWNER_AUTH, method: 'GET', url: '/api/v1/household' })).json().devices;
  assert.ok(!devices.some((d: { userId: string }) => d.userId === alex.member.id));
});

test('a device can be signed out, and a member may only sign out their own', async () => {
  const h = await household();
  const ownerPhone = await h.pair(OWNER_AUTH, 'self');
  const alex = await h.pair(OWNER_AUTH, 'member', 'Alex');

  const me = (await h.app.inject({ headers: ownerPhone.auth, method: 'GET', url: '/api/v1/me' })).json();
  assert.equal(me.member.id, 'u-owner');
  assert.equal(me.household.length, 2);

  const forbidden = await h.app.inject({ headers: alex.auth, method: 'DELETE', url: `/api/v1/devices/${ownerPhone.deviceId}` });
  assert.equal(forbidden.statusCode, 403);
  // Members can't add people either.
  const started = startPairing(h.db, 'Tablet');
  const cannotInvite = await h.app.inject({
    headers: alex.auth,
    method: 'POST',
    url: '/api/v1/pair/approve',
    payload: { code: started.code, as: 'member', name: 'Sam' },
  });
  assert.equal(cannotInvite.statusCode, 403);

  await h.app.inject({ headers: alex.auth, method: 'DELETE', url: `/api/v1/devices/${alex.deviceId}` });
  assert.equal((await h.app.inject({ headers: alex.auth, method: 'GET', url: '/api/v1/me' })).statusCode, 401);
});

test('a household integration sees shared lists only, and cannot sync', async () => {
  const h = await household();
  await h.push(OWNER_AUTH, {
    lists: [list('l-private'), list('l-family', { shared: true, name: 'Family' })],
    tasks: [task('t-secret', { listId: 'l-private', dueDate: '2026-09-27' }), task('t-milk', { listId: 'l-family', dueDate: '2026-09-27' })],
    savedFilters: [
      { id: 'sf-all', name: 'Everything', criteria: { query: '', listIds: [], folderIds: [], tags: [], due: [], status: 'active' }, order: 0, updatedAt: T0 },
    ],
  });
  const ha = await h.pair(OWNER_AUTH, 'integration');

  assert.equal((await h.app.inject({ headers: ha.auth, method: 'GET', url: '/api/v1/sync' })).statusCode, 403);
  const tasks = (await h.app.inject({ headers: ha.auth, method: 'GET', url: '/api/v1/tasks' })).json().tasks;
  assert.deepEqual(tasks.map((t: Task) => t.id), ['t-milk']);
  const lists = (await h.app.inject({ headers: ha.auth, method: 'GET', url: '/api/v1/lists' })).json().lists;
  assert.deepEqual(lists.map((l: ListDef) => l.id), ['l-family']);

  // Everyone's saved filters, each evaluated over shared lists only.
  const filters = (await h.app.inject({ headers: ha.auth, method: 'GET', url: '/api/v1/filters' })).json().filters;
  assert.deepEqual(filters.map((f: { id: string }) => f.id), ['sf-all']);
  const matched = (await h.app.inject({ headers: ha.auth, method: 'GET', url: '/api/v1/filters/sf-all/tasks' })).json();
  assert.deepEqual(matched.tasks.map((t: Task) => t.id), ['t-milk']);

  // It can tick things off and add to a shared list, but has no Inbox.
  const done = await h.app.inject({ headers: ha.auth, method: 'PATCH', url: '/api/v1/tasks/t-milk', payload: { completed: true } });
  assert.equal(done.json().task.completed, true);
  const noInbox = await h.app.inject({ headers: ha.auth, method: 'POST', url: '/api/v1/tasks', payload: { title: 'x' } });
  assert.equal(noInbox.statusCode, 400);
  const added = await h.app.inject({
    headers: ha.auth,
    method: 'POST',
    url: '/api/v1/tasks',
    payload: { text: 'bread ~Family' },
  });
  assert.equal(added.statusCode, 201);
  assert.equal((await h.app.inject({ headers: ha.auth, method: 'GET', url: '/api/v1/tasks/t-secret' })).statusCode, 404);
});

test('pairing codes expire, and a wrong secret never yields a token', async () => {
  const h = await household();
  const now = Date.now();
  const started = startPairing(h.db, 'Laptop', now);
  assert.throws(() => pollPairing(h.db, started.pairingId, 'not-the-secret', now), /No such sign-in/);
  assert.throws(() => pollPairing(h.db, started.pairingId, started.secret, now + PAIRING_TTL_MS + 1), /expired/);
  const late = await h.app.inject({
    headers: OWNER_AUTH,
    method: 'POST',
    url: '/api/v1/pair/approve',
    payload: { code: started.code },
  });
  assert.equal(late.statusCode, 404);
});

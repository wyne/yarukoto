import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Api, SyncBatch, SyncPush } from '../api';
import {
  Outbox,
  mergeBatch,
  mergeFullHydrate,
  pushDirty,
} from '../sync';
import { Task } from '../types';

/** A minimal Task, filled in enough for pushDirty/mergeBatch to look at .id. */
function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    notes: '',
    priority: 'none',
    listId: null,
    tags: [],
    subtasks: [],
    completed: false,
    createdAt: '2020-01-01T00:00:00.000Z',
    order: 0,
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function emptyBatch(now: string): SyncBatch {
  return { now, tasks: [], lists: [], folders: [], viewPrefs: [] };
}

/** A fake Api whose push() runs a hook before resolving, so a test can mutate the
 * outbox mid-flight the same way a user's edit would race a real request. */
function fakeApi(onPush: (body: SyncPush) => Promise<SyncBatch> | SyncBatch): Api {
  return {
    health: async () => null,
    pull: async () => emptyBatch('n/a'),
    push: async (body) => onPush(body),
  };
}

test('mergeBatch: incoming overwrites local, dirty ids are skipped', () => {
  const local = [task('a', { title: 'old-a' }), task('b', { title: 'old-b' })];
  const incoming = [task('a', { title: 'new-a' }), task('b', { title: 'new-b' })];
  const result = mergeBatch(local, incoming, new Set(['b']));

  const byId = new Map(result.map((t) => [t.id, t]));
  assert.equal(byId.get('a')?.title, 'new-a', 'non-dirty row takes the incoming value');
  assert.equal(byId.get('b')?.title, 'old-b', 'dirty row keeps the local value');
});

test('mergeBatch: a local-only row (not in incoming) survives untouched', () => {
  const local = [task('a'), task('local-only')];
  const result = mergeBatch(local, [task('a', { title: 'updated' })], new Set());
  assert.ok(result.some((t) => t.id === 'local-only'), 'mergeBatch treats incoming as a delta, not the whole truth');
});

test('mergeFullHydrate: a non-dirty local row absent from incoming is dropped (hard delete)', () => {
  const local = [task('a'), task('hard-deleted-ghost')];
  const incoming = [task('a')];
  const result = mergeFullHydrate(incoming, local, new Set());
  assert.ok(!result.some((t) => t.id === 'hard-deleted-ghost'), 'a full batch replaces state; absence means gone');
});

test('mergeFullHydrate: a dirty local row survives even if the server never saw it', () => {
  const local = [task('a'), task('unpushed-create')];
  const incoming = [task('a')];
  const result = mergeFullHydrate(incoming, local, new Set(['unpushed-create']));
  assert.ok(result.some((t) => t.id === 'unpushed-create'), 'a queued create must not vanish under a 409 re-hydrate');
});

test('mergeFullHydrate: a dirty local row overrides the server’s stale copy of the same id', () => {
  const local = [task('a', { title: 'local-newer' })];
  const incoming = [task('a', { title: 'server-stale' })];
  const result = mergeFullHydrate(incoming, local, new Set(['a']));
  assert.equal(result[0].title, 'local-newer');
});

test('Outbox: mark/has/size/snapshot basics', () => {
  const outbox = new Outbox();
  assert.equal(outbox.size, 0);
  outbox.mark(['a', 'b']);
  assert.equal(outbox.size, 2);
  assert.ok(outbox.has('a'));
  assert.deepEqual(outbox.snapshot(), new Set(['a', 'b']));
});

test('pushDirty: an edit that lands during the in-flight push is not lost', async () => {
  const outbox = new Outbox();
  outbox.mark(['t1']);
  const state = { tasks: [task('t1', { title: 'v1' })], lists: [], folders: [], viewPrefs: [] };

  const api = fakeApi(async (body) => {
    // Simulate the user editing t1 again while this request is in flight.
    outbox.mark(['t1']);
    return { now: 'server-now', tasks: body.tasks ?? [], lists: [], folders: [], viewPrefs: [] };
  });

  await pushDirty(api, outbox, state);

  assert.ok(outbox.has('t1'), 'the mid-flight edit must keep t1 dirty for the next cycle');
  assert.equal(outbox.size, 1);
});

test('pushDirty: a clean push (no race) clears the outbox', async () => {
  const outbox = new Outbox();
  outbox.mark(['t1']);
  const state = { tasks: [task('t1')], lists: [], folders: [], viewPrefs: [] };

  const api = fakeApi(async (body) => ({ now: 'server-now', tasks: body.tasks ?? [], lists: [], folders: [], viewPrefs: [] }));

  await pushDirty(api, outbox, state);

  assert.equal(outbox.size, 0);
});

test('pushDirty: chunks large outboxes and clears only what each chunk sent', async () => {
  const outbox = new Outbox();
  const tasks: Task[] = [];
  for (let i = 0; i < 450; i++) {
    const id = `t${i}`;
    tasks.push(task(id));
    outbox.mark([id]);
  }
  const state = { tasks, lists: [], folders: [], viewPrefs: [] };

  const chunkSizes: number[] = [];
  const api = fakeApi(async (body) => {
    chunkSizes.push((body.tasks ?? []).length);
    return { now: `server-${chunkSizes.length}`, tasks: body.tasks ?? [], lists: [], folders: [], viewPrefs: [] };
  });

  const result = await pushDirty(api, outbox, state);

  assert.deepEqual(chunkSizes, [200, 200, 50], 'sent in 200-record chunks');
  assert.equal(result.tasks.length, 450, 'the merged result carries every accepted record');
  assert.equal(result.now, 'server-3', 'the cursor comes from the last chunk');
  assert.equal(outbox.size, 0, 'every id was cleared once its chunk succeeded');
});

test('pushDirty: a later chunk failing does not undo an earlier chunk’s progress', async () => {
  const outbox = new Outbox();
  const tasks: Task[] = [];
  for (let i = 0; i < 450; i++) {
    const id = `t${i}`;
    tasks.push(task(id));
    outbox.mark([id]);
  }
  const state = { tasks, lists: [], folders: [], viewPrefs: [] };

  let calls = 0;
  const api = fakeApi(async (body) => {
    calls++;
    if (calls === 2) throw new Error('network drop');
    return { now: 'ok', tasks: body.tasks ?? [], lists: [], folders: [], viewPrefs: [] };
  });

  await assert.rejects(() => pushDirty(api, outbox, state));
  assert.equal(outbox.size, 250, 'the first chunk (200) cleared; the failed and unattempted chunks (200 + 50) stay dirty');
});

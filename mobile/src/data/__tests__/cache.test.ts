import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CACHE_VERSION, CacheSnapshot, deserialize, fitsCache, serialize } from '../cache';
import { Task } from '../types';

function task(id: string): Task {
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
  };
}

function snapshot(overrides: Partial<CacheSnapshot> = {}): CacheSnapshot {
  return {
    version: CACHE_VERSION,
    serverUrl: 'https://example.com',
    cursor: '2024-01-01T00:00:00.000Z',
    tasks: [task('t1')],
    lists: [],
    folders: [],
    viewPrefs: [],
    outbox: [],
    ...overrides,
  };
}

test('round trip: serialize then deserialize returns an equivalent snapshot', () => {
  const s = snapshot();
  const result = deserialize(serialize(s), s.serverUrl);
  assert.deepEqual(result, s);
});

test('deserialize rejects a snapshot from a different server', () => {
  const s = snapshot({ serverUrl: 'https://old-server.example.com' });
  const result = deserialize(serialize(s), 'https://example.com');
  assert.equal(result, null);
});

test('deserialize rejects a mismatched version', () => {
  const raw = JSON.stringify({ ...snapshot(), version: 999 });
  assert.equal(deserialize(raw, 'https://example.com'), null);
});

test('deserialize rejects malformed JSON without throwing', () => {
  assert.equal(deserialize('{not json', 'https://example.com'), null);
});

test('deserialize rejects a null/missing blob', () => {
  assert.equal(deserialize(null, 'https://example.com'), null);
});

test('deserialize rejects a shape missing required fields', () => {
  const raw = JSON.stringify({ version: CACHE_VERSION, serverUrl: 'https://example.com' });
  assert.equal(deserialize(raw, 'https://example.com'), null);
});

test(
  'regression: a cursor can never be restored without its data — the bug storage.ts documents',
  () => {
    // The historical bug: a persisted cursor with no cached tasks made the next
    // pull incremental (asking only for what changed since that cursor) against
    // an empty local state, so every existing task stayed invisible. Simulate a
    // snapshot that somehow has a cursor but no data, and confirm deserialize()
    // still hands back a whole, self-consistent snapshot rather than something
    // a caller could misuse to reproduce that bug (e.g. by trusting the cursor
    // alone while discarding the rest).
    const s = snapshot({ cursor: '2024-06-01T00:00:00.000Z', tasks: [], lists: [], folders: [] });
    const result = deserialize(serialize(s), s.serverUrl);
    assert.ok(result, 'a well-formed empty-but-consistent snapshot is still valid');
    assert.equal(result!.cursor, s.cursor);
    assert.deepEqual(result!.tasks, []);
    // The point: cursor and tasks come back together, from the same blob, as a
    // unit — there is no accessor that reads one without the other.
  }
);

test('fitsCache: accepts a small snapshot and rejects one over the size cap', () => {
  const small = serialize(snapshot());
  assert.ok(fitsCache(small));

  const huge = serialize(snapshot({ tasks: Array.from({ length: 100000 }, (_, i) => task(`t${i}`)) }));
  assert.ok(!fitsCache(huge));
});

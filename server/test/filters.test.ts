import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { SavedFilter, Task } from '../../shared/types';
import { EMPTY_CRITERIA } from '../../shared/taskFilter';
import { toISODate } from '../../shared/dates';
import { runMigrations } from '../src/db';
import { wallClockNow } from '../src/clock';
import { env } from '../src/env';
import { registerSyncRoutes } from '../src/routes/sync';
import { registerTaskRoutes } from '../src/routes/tasks';
import { savedFilterTasks } from '../src/taskService';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

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
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    order: 0,
    ...fields,
  };
}

function filter(id: string, fields: Partial<SavedFilter> = {}): SavedFilter {
  return {
    id,
    name: id,
    criteria: EMPTY_CRITERIA,
    order: 0,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...fields,
  };
}

async function syncApp(db: Database.Database) {
  const app = Fastify();
  registerSyncRoutes(app, db);
  registerTaskRoutes(app, db);
  await app.ready();
  return app;
}

test('saved filters round-trip through sync and honour last-write-wins', async () => {
  const db = openDb();
  const app = await syncApp(db);

  const today = filter('sf-today', {
    name: 'Due today',
    criteria: { ...EMPTY_CRITERIA, due: ['today', 'overdue'], tags: ['home'] },
  });
  const pushed = await app.inject({ method: 'POST', url: '/api/v1/sync', payload: { savedFilters: [today] } });
  assert.deepEqual(pushed.json().savedFilters, [today]);

  const stale = { ...today, name: 'Older', updatedAt: '2026-08-01T00:00:00.000Z' };
  const rejected = await app.inject({ method: 'POST', url: '/api/v1/sync', payload: { savedFilters: [stale] } });
  assert.equal(rejected.json().savedFilters[0].name, 'Due today');

  const pulled = (await app.inject({ method: 'GET', url: '/api/v1/sync' })).json();
  assert.deepEqual(pulled.savedFilters, [today]);
  const later = (await app.inject({ method: 'GET', url: `/api/v1/sync?since=${pulled.now}` })).json();
  assert.deepEqual(later.savedFilters, []);
});

test('criteria a newer client wrote are normalised rather than passed through', async () => {
  const db = openDb();
  const app = await syncApp(db);
  const odd = {
    ...filter('sf-odd'),
    criteria: { query: 7, listIds: ['l-a', 3], due: ['today', 'someday'], status: 'snoozed', extra: true },
  };
  const pushed = await app.inject({ method: 'POST', url: '/api/v1/sync', payload: { savedFilters: [odd] } });
  assert.deepEqual(pushed.json().savedFilters[0].criteria, {
    ...EMPTY_CRITERIA,
    listIds: ['l-a'],
    due: ['today'],
  });
});

test('savedFilterTasks evaluates criteria with the shared matcher', () => {
  const db = openDb();
  const app = Fastify();
  registerSyncRoutes(app, db);
  // Sunday 27 Sep 2026, noon.
  const now = new Date(2026, 8, 27, 12);
  return app.inject({
    method: 'POST',
    url: '/api/v1/sync',
    payload: {
      tasks: [
        task('t-today', { dueDate: '2026-09-27', tags: ['home'], order: 2 }),
        task('t-overdue', { dueDate: '2026-09-20', tags: ['home'], order: 1 }),
        task('t-tomorrow', { dueDate: '2026-09-28', tags: ['home'] }),
        task('t-work', { dueDate: '2026-09-27', tags: ['work'] }),
        task('t-done', { dueDate: '2026-09-27', tags: ['home'], completed: true }),
        task('t-trashed', { dueDate: '2026-09-27', tags: ['home'], deletedAt: '2026-09-02T00:00:00.000Z' }),
      ],
      savedFilters: [
        filter('sf-today', { criteria: { ...EMPTY_CRITERIA, due: ['today', 'overdue'], tags: ['home'] } }),
        filter('sf-gone', { deletedAt: '2026-09-02T00:00:00.000Z' }),
      ],
    },
  }).then(() => {
    const { tasks } = savedFilterTasks(db, 'sf-today', now);
    assert.deepEqual(
      tasks.map((t) => t.id),
      ['t-overdue', 't-today']
    );
    assert.throws(() => savedFilterTasks(db, 'sf-gone', now), /No saved filter/);
  });
});

test('GET /filters lists live filters and /filters/:id/tasks resolves today in YARUKOTO_TZ', async () => {
  const db = openDb();
  const app = await syncApp(db);
  const today = toISODate(wallClockNow(env.timeZone));
  await app.inject({
    method: 'POST',
    url: '/api/v1/sync',
    payload: {
      tasks: [task('t-a', { dueDate: today }), task('t-b')],
      savedFilters: [
        filter('sf-b', { name: 'Second', order: 2 }),
        filter('sf-a', { name: 'Today', order: 1, criteria: { ...EMPTY_CRITERIA, due: ['today'] } }),
        filter('sf-x', { deletedAt: '2026-09-02T00:00:00.000Z' }),
      ],
    },
  });

  const listed = (await app.inject({ method: 'GET', url: '/api/v1/filters' })).json();
  assert.deepEqual(
    listed.filters.map((f: SavedFilter) => f.id),
    ['sf-a', 'sf-b']
  );

  const res = (await app.inject({ method: 'GET', url: '/api/v1/filters/sf-a/tasks' })).json();
  assert.equal(res.today, today);
  assert.equal(res.filter.name, 'Today');
  assert.deepEqual(
    res.tasks.map((t: Task) => t.id),
    ['t-a']
  );

  const missing = await app.inject({ method: 'GET', url: '/api/v1/filters/sf-x/tasks' });
  assert.equal(missing.statusCode, 404);
});

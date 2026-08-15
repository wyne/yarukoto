import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify, { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { openDatabase } from '../../db';
import { requireAuth } from '../../auth';
import { registerSyncRoutes } from '../sync';

// env.token is fixed by YARUKOTO_TOKEN in the `test` npm script (module-level,
// so it has to be set before node starts rather than inside this file).
const TOKEN = 'test-token';

function buildApp(db: Database.Database): FastifyInstance {
  const app = Fastify();
  app.addHook('onRequest', requireAuth);
  registerSyncRoutes(app, db);
  return app;
}

function auth() {
  return { authorization: `Bearer ${TOKEN}` };
}

test('a view pref pushed with a client clock behind the server is still returned by a later incremental pull', async () => {
  const db = openDatabase();
  const app = buildApp(db);

  const before = await app.inject({ method: 'GET', url: '/api/v1/sync', headers: auth() });
  const cursor = JSON.parse(before.body).now as string;

  // A client whose clock runs a year behind the server pushes a view pref.
  const push = await app.inject({
    method: 'POST',
    url: '/api/v1/sync',
    headers: auth(),
    payload: { viewPrefs: [{ id: 'today', groupBy: 'tag', sortBy: 'date', updatedAt: '2020-01-01T00:00:00.000Z' }] },
  });
  assert.equal(push.statusCode, 200);

  // An incremental pull since a cursor captured *before* the push must see it —
  // filtering on server_updated_at (this server's clock), not the client-stamped
  // updatedAt, is exactly what makes that true regardless of the client's clock.
  const after = await app.inject({ method: 'GET', url: `/api/v1/sync?since=${encodeURIComponent(cursor)}`, headers: auth() });
  const body = JSON.parse(after.body);
  assert.ok(
    body.viewPrefs.some((p: { id: string }) => p.id === 'today'),
    'the clock-skewed view pref must appear in the incremental pull, not be silently dropped forever'
  );

  await app.close();
});

test('upsertViewPref rejects a push older than the stored record (last-write-wins)', async () => {
  const db = openDatabase();
  const app = buildApp(db);

  await app.inject({
    method: 'POST',
    url: '/api/v1/sync',
    headers: auth(),
    payload: { viewPrefs: [{ id: 'inbox', groupBy: 'tag', sortBy: 'date', updatedAt: '2024-06-01T00:00:00.000Z' }] },
  });

  // A stale write arrives after — an offline client replaying a queued edit,
  // or one whose clock is behind.
  const stalePush = await app.inject({
    method: 'POST',
    url: '/api/v1/sync',
    headers: auth(),
    payload: { viewPrefs: [{ id: 'inbox', groupBy: 'priority', sortBy: 'manual', updatedAt: '2024-01-01T00:00:00.000Z' }] },
  });
  const staleBody = JSON.parse(stalePush.body);
  assert.equal(staleBody.viewPrefs[0].groupBy, 'tag', 'the older write must not overwrite the newer stored record');

  const pull = await app.inject({ method: 'GET', url: '/api/v1/sync', headers: auth() });
  const pullBody = JSON.parse(pull.body);
  const inbox = pullBody.viewPrefs.find((p: { id: string }) => p.id === 'inbox');
  assert.equal(inbox.groupBy, 'tag', 'the stored record itself is unchanged by the stale push');

  await app.close();
});

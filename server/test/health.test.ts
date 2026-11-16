import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { SERVER_FEATURES } from '@yarukoto/domain/types';
import { env, parseServerName, SERVER_NAME_MAX } from '../src/env';
import { registerHealthRoute } from '../src/routes/health';

test('health reports the features and the trash window apps expire against', async () => {
  const app = Fastify();
  registerHealthRoute(app);
  const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.features, [...SERVER_FEATURES]);
  assert.equal(body.trashRetentionDays, env.trashRetentionDays);
  assert.equal(body.name, env.serverName);
  await app.close();
});

test('a server name is trimmed, capped, and absent when blank', () => {
  assert.equal(parseServerName(undefined), null);
  assert.equal(parseServerName('   '), null);
  assert.equal(parseServerName('  Home\n server '), 'Home server');
  assert.equal(parseServerName('x'.repeat(100))?.length, SERVER_NAME_MAX);
});

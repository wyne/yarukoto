import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { requireAuth } from '../src/auth';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', requireAuth);
  app.get('/private', async () => ({ ok: true }));
  await app.ready();
  return app;
}

test('protected routes reject missing and incorrect bearer tokens', async () => {
  const app = await buildApp();

  const missing = await app.inject({ method: 'GET', url: '/private' });
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(missing.json(), { error: 'unauthorized' });

  const incorrect = await app.inject({
    method: 'GET',
    url: '/private',
    headers: { authorization: 'Bearer wrong' },
  });
  assert.equal(incorrect.statusCode, 401);

  await app.close();
});

test('protected routes accept the configured bearer token', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'GET',
    url: '/private',
    headers: { authorization: 'Bearer test' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  await app.close();
});

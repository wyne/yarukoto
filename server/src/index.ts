import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyCompress from '@fastify/compress';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { env } from './env';
import { openDatabase } from './db';
import { requireAuth } from './auth';
import { registerHealthRoute } from './routes/health';
import { registerSyncRoutes } from './routes/sync';
import { registerHistoryRoutes } from './routes/history';
import { scheduleRetention } from './retention';
import { buildInfo } from './version';

async function main() {
  const db = openDatabase();
  scheduleRetention(db);

  const app = Fastify({ logger: true });

  // Auth is the real boundary (a bearer token), so CORS just needs to not get in
  // the way of browser clients — including the Expo web dev server, which runs
  // on a different origin than the server itself.
  await app.register(fastifyCors, { origin: true });

  // Every launch is a full hydrate by design (see storage.ts), and task JSON —
  // every task, tags and subtasks embedded as strings — gzips roughly 8-10x.
  // Compressing the API responses is the single highest-value byte reduction
  // available for a client on a phone; the static web build benefits too.
  //
  // Gotcha this surfaced: an `async` route handler that calls `reply.send(x)`
  // without returning it — valid, ordinary Fastify style without compression —
  // races the gzip stream against the handler's own promise resolution here,
  // and ships a broken, empty body with `content-length: 0`. Every async
  // handler in routes/ now does `return reply.send(...)` instead. Plain
  // (non-async) handlers, like the notFoundHandler below, aren't affected.
  await app.register(fastifyCompress, { global: true });

  registerHealthRoute(app);

  app.register((instance, _opts, done) => {
    instance.addHook('onRequest', requireAuth);
    registerSyncRoutes(instance, db);
    registerHistoryRoutes(instance, db);
    done();
  });

  const webRootExists = fs.existsSync(env.webRoot);
  if (webRootExists) {
    app.register(fastifyStatic, { root: env.webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      reply.sendFile('index.html');
    });
  } else {
    // Without this, `/` falls through to Fastify's default JSON 404 and the only
    // symptom is "the web app serves JSON" — with nothing anywhere saying why.
    app.log.warn(
      { webRoot: env.webRoot },
      'No web build found; serving the API only. Set WEB_ROOT, or build the image so the client is present.'
    );
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      reply.code(404).send({
        error: 'no_web_build',
        message: `No web client at ${env.webRoot}. This server is running API-only.`,
      });
    });
  }

  await app.listen({ host: '0.0.0.0', port: env.port });
  app.log.info(
    {
      version: buildInfo.version,
      commit: buildInfo.commitShort,
      builtAt: buildInfo.builtAt,
      webRoot: env.webRoot,
      servingWebClient: webRootExists,
      database: env.databasePath,
    },
    'Yarukoto ready'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


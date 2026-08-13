import fs from 'node:fs';
import Fastify from 'fastify';
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


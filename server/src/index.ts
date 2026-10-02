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
import { registerTaskRoutes } from './routes/tasks';
import { registerMcpRoutes } from './mcp';
import { registerHouseholdRoutes, registerPairingRoutes } from './routes/household';
import { scheduleRetention } from './retention';
import { scheduleBackups } from './backup';
import { registerBackupRoutes } from './routes/backup';
import { acceptEmptyJson } from './http';
import { buildInfo } from './version';

async function main() {
  const db = openDatabase();
  scheduleRetention(db);

  const app = Fastify({ logger: { level: env.logLevel }, trustProxy: env.trustProxy });
  acceptEmptyJson(app);
  scheduleBackups(db, app.log);

  // Auth is the real boundary (a bearer token), so CORS just needs to not get in
  // the way of browser clients — including the Expo web dev server, which runs
  // on a different origin than the server itself.
  await app.register(fastifyCors, { origin: true });

  // Declared up front so every request object has the same shape; the auth
  // hook fills it in.
  app.decorateRequest('viewer', null as never);
  registerHealthRoute(app);
  registerPairingRoutes(app, db);

  app.register((instance, _opts, done) => {
    instance.addHook('onRequest', requireAuth(db));
    registerHouseholdRoutes(instance, db);
    registerSyncRoutes(instance, db);
    registerHistoryRoutes(instance, db);
    registerTaskRoutes(instance, db);
    registerMcpRoutes(instance, db);
    registerBackupRoutes(instance, db);
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
      backups:
        env.backupIntervalHours > 0 && env.backupKeep > 0
          ? { dir: env.backupDir, everyHours: env.backupIntervalHours, keep: env.backupKeep }
          : 'off',
    },
    'Yarukoto ready'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


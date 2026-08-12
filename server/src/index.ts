import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { env } from './env';
import { openDatabase } from './db';
import { requireAuth } from './auth';
import { registerHealthRoute } from './routes/health';
import { registerSyncRoutes } from './routes/sync';
import { registerHistoryRoutes } from './routes/history';
import { scheduleRetention } from './retention';

async function main() {
  const db = openDatabase();
  scheduleRetention(db);

  const app = Fastify({ logger: true });

  registerHealthRoute(app);

  app.register((instance, _opts, done) => {
    instance.addHook('onRequest', requireAuth);
    registerSyncRoutes(instance, db);
    registerHistoryRoutes(instance, db);
    done();
  });

  if (fs.existsSync(env.webRoot)) {
    app.register(fastifyStatic, { root: env.webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  await app.listen({ host: '0.0.0.0', port: env.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

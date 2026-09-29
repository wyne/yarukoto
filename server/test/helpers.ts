import Database from 'better-sqlite3';
import Fastify, { FastifyInstance } from 'fastify';
import { requireAuth } from '../src/auth';
import { acceptEmptyJson } from '../src/http';

/**
 * A Fastify app behind the real auth hook, as `index.ts` builds it. Requests
 * authenticate with `Bearer test` (the env token, i.e. the owner) or a device
 * token.
 */
export function authedApp(db: Database.Database): FastifyInstance {
  const app = Fastify();
  acceptEmptyJson(app);
  app.decorateRequest('viewer', null as never);
  app.addHook('onRequest', requireAuth(db));
  return app;
}

export const OWNER_AUTH = { authorization: 'Bearer test' };

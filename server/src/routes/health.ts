import { FastifyInstance } from 'fastify';
import { buildInfo } from '../version';

export function registerHealthRoute(app: FastifyInstance): void {
  // Unauthenticated on purpose: this is what a client probes before it has a
  // token, so the build fields have to stay free of anything sensitive.
  app.get('/api/v1/health', async (_request, reply) => {
    // `return reply.send(...)`, not a bare call — see the note in index.ts
    // next to where compression is registered.
    return reply.send({ ok: true, ...buildInfo });
  });
}

import { FastifyInstance } from 'fastify';
import { SERVER_FEATURES } from '../../../shared/types';
import { buildInfo } from '../version';

export function registerHealthRoute(app: FastifyInstance): void {
  // Unauthenticated on purpose: this is what a client probes before it has a
  // token, so the build fields have to stay free of anything sensitive.
  app.get('/api/v1/health', async (_request, reply) => {
    reply.send({ ok: true, ...buildInfo, features: SERVER_FEATURES });
  });
}

import { FastifyInstance } from 'fastify';
import { SERVER_FEATURES } from '@yarukoto/domain/types';
import { env } from '../env';
import { buildInfo } from '../version';

export function registerHealthRoute(app: FastifyInstance): void {
  // Unauthenticated on purpose: this is what a client probes before it has a
  // token, so the build fields have to stay free of anything sensitive.
  app.get('/api/v1/health', async (_request, reply) => {
    // The trash window is how long apps keep deleted rows before dropping them
    // themselves: purges never reach a device as a pull, because nothing is left
    // to pull.
    reply.send({ ok: true, ...buildInfo, features: SERVER_FEATURES, trashRetentionDays: env.trashRetentionDays });
  });
}

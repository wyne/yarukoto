import { FastifyInstance } from 'fastify';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/api/v1/health', async (_request, reply) => {
    reply.send({ ok: true });
  });
}

import crypto from 'node:crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env';

export function requireAuth(request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void {
  const header = request.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  const expected = Buffer.from(env.token);
  const actual = Buffer.from(scheme === 'Bearer' && token ? token : '');

  const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!valid) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  done();
}

import type { FastifyInstance } from 'fastify';

/**
 * Accept an empty body labelled `application/json` as no body at all.
 *
 * Fastify's default parser rejects it with a 400, and app builds before the
 * household release send that header on every request, bodyless DELETEs
 * included. Those builds stay installed on phones long after the server
 * updates, so the server is the side that has to forgive it.
 */
export function acceptEmptyJson(app: FastifyInstance): void {
  // Fastify's own defaults for prototype and constructor poisoning.
  const parse = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') {
      done(null, undefined);
      return;
    }
    parse(req, text, done);
  });
}

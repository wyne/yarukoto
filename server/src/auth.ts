import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { FastifyReply, FastifyRequest } from 'fastify';
import { HouseholdRole } from '@yarukoto/domain/types';
import { env } from './env';
import { OWNER_VIEWER, Viewer } from './access';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the auth hook on every authenticated route. */
    viewer: Viewer;
  }
}

/** How stale `last_seen_at` may get before a request rewrites it. */
const LAST_SEEN_RESOLUTION_MS = 60_000;

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Resolves a bearer token to who it acts as, or null.
 *
 * The env token is the household owner, exactly as it was the only credential
 * before households existed. Every other token is a device's, looked up by hash;
 * a revoked device, or one belonging to a removed person, is no longer anyone.
 */
export function resolveToken(db: Database.Database, token: string): Viewer | null {
  if (!token) return null;
  if (sameSecret(token, env.token)) return OWNER_VIEWER;

  const row = db
    .prepare(
      `SELECT d.id, d.user_id, d.last_seen_at, u.role, u.deleted_at AS user_deleted_at
       FROM devices d LEFT JOIN users u ON u.id = d.user_id
       WHERE d.token_hash = ? AND d.revoked_at IS NULL`
    )
    .get(hashToken(token)) as
    | { id: string; user_id: string | null; last_seen_at: string | null; role: HouseholdRole | null; user_deleted_at: string | null }
    | undefined;
  if (!row) return null;
  if (row.user_id && (!row.role || row.user_deleted_at)) return null;

  const now = Date.now();
  if (!row.last_seen_at || now - Date.parse(row.last_seen_at) > LAST_SEEN_RESOLUTION_MS) {
    db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(new Date(now).toISOString(), row.id);
  }

  return row.user_id
    ? { kind: 'user', userId: row.user_id, role: row.role!, deviceId: row.id }
    : { kind: 'household', deviceId: row.id };
}

/**
 * Why a token that resolved to no one was refused, for the client to tell its
 * person. `signed_out` means the token was real once — its device was signed
 * out, or its person removed — so signing in again is the only fix. Anything
 * else is `unauthorized`, which may just be a server started with a different
 * access token.
 */
function rejection(db: Database.Database, token: string): 'signed_out' | 'unauthorized' {
  if (!token) return 'unauthorized';
  const known = db.prepare('SELECT 1 FROM devices WHERE token_hash = ?').get(hashToken(token));
  return known ? 'signed_out' : 'unauthorized';
}

/** An `onRequest` hook that rejects anything without a valid bearer token. */
export function requireAuth(db: Database.Database) {
  return (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void => {
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    const viewer = scheme === 'Bearer' && token ? resolveToken(db, token) : null;
    if (!viewer) {
      reply.code(401).send({ error: rejection(db, scheme === 'Bearer' ? (token ?? '') : '') });
      return;
    }
    request.viewer = viewer;
    done();
  };
}

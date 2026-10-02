import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { isAdmin } from '../access';
import { viewerOf } from '../viewer';
import { backupFileName, backupTo } from '../backup';

/**
 * `GET /api/v1/backup` — a fresh, consistent copy of the whole database, for an
 * admin to download (or for a cron job with the owner token to pull off-box).
 * Admin-only because the file holds every person's private lists.
 */
export function registerBackupRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get('/api/v1/backup', async (request, reply) => {
    if (!isAdmin(viewerOf(request))) {
      reply.code(403).send({ error: 'forbidden', message: 'Only an admin can download a backup.' });
      return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yarukoto-backup-'));
    const name = backupFileName();
    const file = path.join(dir, name);
    await backupTo(db, file);
    const stream = fs.createReadStream(file);
    stream.on('close', () => fs.rmSync(dir, { recursive: true, force: true }));
    reply
      .header('content-type', 'application/vnd.sqlite3')
      .header('content-disposition', `attachment; filename="${name}"`)
      .header('cache-control', 'no-store');
    return reply.send(stream);
  });
}

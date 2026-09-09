import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { Task } from '../../../shared/types';
import { TaskRow, recordRevision, taskFromRow } from '../model';

interface CompleteBody {
  /** ISO timestamp of the tap, from the device's clock. */
  completedAt?: string;
}

/**
 * Single-field mutations that exist for one caller: the iOS notification action
 * handler, which runs in Swift with no access to the app's sync client.
 *
 * `POST /sync` is unusable from there. It upserts *whole rows*, so a caller has
 * to hold the complete task — and, worse, has to reimplement the feature
 * negotiation in `pushDirty`, where getting it wrong silently destroys stored
 * fields. Native code cannot read AsyncStorage cleanly enough to hold the row,
 * and duplicating negotiation logic in a second language is exactly the drift
 * the protocol in AGENTS.md exists to prevent.
 *
 * So the notification path gets an endpoint that needs no row and no
 * negotiation: a task id, a timestamp, one column. Android does not use it —
 * its headless task boots the real JS bundle and goes through `pushDirty` like
 * everything else.
 *
 * Deliberately not behind a `SERVER_FEATURES` id. There is nothing to negotiate:
 * an older server 404s, and the client falls back to queueing the action for its
 * next foreground sync, which is where the action was headed anyway. The
 * protocol guards against *stripped fields on a whole-row upsert*, and this
 * endpoint writes no rows.
 */
export function registerTaskRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post<{ Params: { id: string }; Body: CompleteBody }>(
    '/api/v1/tasks/:id/complete',
    async (request, reply) => {
      const { id } = request.params;
      const completedAt = request.body?.completedAt ?? new Date().toISOString();

      if (Number.isNaN(Date.parse(completedAt))) {
        reply.code(400).send({ error: 'bad_completed_at' });
        return;
      }

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      if (!row || row.deleted_at) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }

      // The same last-write-wins guard `upsertTask` applies. A notification can
      // sit on the lock screen for hours, so by the time it is tapped the task
      // may already have been edited elsewhere; that later edit wins, and the
      // stale completion is dropped rather than resurrected.
      if (row.updated_at >= completedAt) {
        reply.send({ task: taskFromRow(row), applied: false });
        return;
      }

      const task: Task = { ...taskFromRow(row), completed: true, completedAt, updatedAt: completedAt };

      db.transaction(() => {
        db.prepare(
          `UPDATE tasks
           SET completed = 1, completed_at = @completedAt, updated_at = @updatedAt, server_updated_at = @serverUpdatedAt
           WHERE id = @id`
        ).run({
          id,
          completedAt,
          updatedAt: completedAt,
          // Server clock, not the device's — this is what pull cursors compare
          // against, so it has to come from here even though `updated_at` does not.
          serverUpdatedAt: new Date().toISOString(),
        });
        recordRevision(db, task, 'update');
      })();

      reply.send({ task, applied: true });
    }
  );
}

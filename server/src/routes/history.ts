import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { taskVisibleSql, viewerParams } from '../access';
import { viewerOf } from '../viewer';

// History is shown for tasks the viewer can see *now*. A revision is a snapshot
// of the whole task, so one recorded while a list was shared would otherwise
// keep showing it to someone after it was made private again.

export function registerHistoryRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get<{ Querystring: { limit?: string; beforeId?: string } }>('/api/v1/activity', async (request, reply) => {
    const limit = Math.max(1, Math.min(200, Number(request.query.limit ?? 80) || 80));
    const beforeId = Math.max(0, Number(request.query.beforeId ?? 0) || 0);
    const viewer = viewerOf(request);
    const rows = db
      .prepare(
        `SELECT r.id, r.task_id, r.snapshot, r.op, r.recorded_at
         FROM task_revisions r JOIN tasks ON tasks.id = r.task_id
         WHERE (@beforeId = 0 OR r.id < @beforeId) AND ${taskVisibleSql(viewer)}
         ORDER BY r.id DESC
         LIMIT @limit`
      )
      .all({ ...viewerParams(viewer), beforeId, limit }) as {
        id: number;
        task_id: string;
        snapshot: string;
        op: string;
        recorded_at: string;
      }[];
    const previous = db.prepare(
      'SELECT snapshot FROM task_revisions WHERE task_id = ? AND id < ? ORDER BY id DESC LIMIT 1'
    );

    reply.send({
      revisions: rows.map((r) => {
        const prev = previous.get(r.task_id, r.id) as { snapshot: string } | undefined;
        return {
          id: r.id,
          taskId: r.task_id,
          task: JSON.parse(r.snapshot),
          previousTask: prev ? JSON.parse(prev.snapshot) : null,
          op: r.op,
          recordedAt: r.recorded_at,
        };
      }),
    });
  });

  app.get<{ Params: { id: string } }>('/api/v1/tasks/:id/history', async (request, reply) => {
    const viewer = viewerOf(request);
    const rows = db
      .prepare(
        `SELECT r.snapshot, r.op, r.recorded_at
         FROM task_revisions r JOIN tasks ON tasks.id = r.task_id
         WHERE r.task_id = @id AND ${taskVisibleSql(viewer)}
         ORDER BY r.id DESC`
      )
      .all({ ...viewerParams(viewer), id: request.params.id }) as { snapshot: string; op: string; recorded_at: string }[];

    reply.send({
      revisions: rows.map((r) => ({ task: JSON.parse(r.snapshot), op: r.op, recordedAt: r.recorded_at })),
    });
  });
}

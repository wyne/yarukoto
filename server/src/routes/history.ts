import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';

export function registerHistoryRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get<{ Querystring: { limit?: string } }>('/api/v1/activity', async (request, reply) => {
    const limit = Math.max(1, Math.min(200, Number(request.query.limit ?? 80) || 80));
    const rows = db
      .prepare('SELECT id, task_id, snapshot, op, recorded_at FROM task_revisions ORDER BY id DESC LIMIT ?')
      .all(limit) as { id: number; task_id: string; snapshot: string; op: string; recorded_at: string }[];
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
    const rows = db
      .prepare('SELECT snapshot, op, recorded_at FROM task_revisions WHERE task_id = ? ORDER BY id DESC')
      .all(request.params.id) as { snapshot: string; op: string; recorded_at: string }[];

    reply.send({
      revisions: rows.map((r) => ({ task: JSON.parse(r.snapshot), op: r.op, recordedAt: r.recorded_at })),
    });
  });
}

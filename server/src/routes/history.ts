import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';

export function registerHistoryRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get<{ Params: { id: string } }>('/api/v1/tasks/:id/history', async (request, reply) => {
    const rows = db
      .prepare('SELECT snapshot, op, recorded_at FROM task_revisions WHERE task_id = ? ORDER BY id DESC')
      .all(request.params.id) as { snapshot: string; op: string; recorded_at: string }[];

    // `return reply.send(...)` — see the note in index.ts next to compress.
    return reply.send({
      revisions: rows.map((r) => ({ task: JSON.parse(r.snapshot), op: r.op, recordedAt: r.recorded_at })),
    });
  });
}

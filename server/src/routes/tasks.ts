import { FastifyInstance, FastifyReply } from 'fastify';
import Database from 'better-sqlite3';
import { env } from '../env';
import { wallClockNow } from '../clock';
import {
  CreateInput,
  TaskFilter,
  TaskInput,
  TaskServiceError,
  TaskStatus,
  completeTaskAt,
  createTask,
  getTask,
  listLists,
  listTasks,
  restoreTask,
  trashTask,
  updateTask,
} from '../taskService';

interface CompleteBody {
  /** ISO timestamp of the tap, from the device's clock. */
  completedAt?: string;
}

interface ListQuery {
  status?: TaskStatus;
  /** A list id, or 'inbox' for unfiled tasks. */
  listId?: string;
  tag?: string;
  dueFrom?: string;
  dueTo?: string;
  q?: string;
  limit?: string;
}

/**
 * Field-level task routes, for callers that are not a syncing client: scripts,
 * a CLI, and (through the same service) the MCP tools in `../mcp.ts`. The app
 * itself never calls these — it syncs whole rows through `/sync` — so they carry
 * no `SERVER_FEATURES` id: there is no client UI to gate and no field to strip.
 *
 * `POST /tasks/:id/complete` predates the rest and exists for the iOS
 * notification action handler, which runs in Swift with no access to the app's
 * sync client. It keeps its own device-clock semantics; see `completeTaskAt`.
 * An older server 404s it, and the client falls back to queueing the action for
 * its next foreground sync, which is where the action was headed anyway.
 */
export function registerTaskRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get<{ Querystring: ListQuery }>('/api/v1/tasks', async (request, reply) => {
    const q = request.query;
    const filter: TaskFilter = {
      status: q.status,
      listId: q.listId === 'inbox' ? null : q.listId,
      tag: q.tag,
      dueFrom: q.dueFrom,
      dueTo: q.dueTo,
      query: q.q,
      limit: q.limit ? Number(q.limit) : undefined,
    };
    if (filter.status && !['open', 'completed', 'all', 'trash'].includes(filter.status)) {
      reply.code(400).send({ error: 'bad_request', message: 'status must be open, completed, all or trash' });
      return;
    }
    await respond(reply, () => ({ tasks: listTasks(db, filter) }));
  });

  app.get<{ Params: { id: string } }>('/api/v1/tasks/:id', async (request, reply) => {
    await respond(reply, () => ({ task: getTask(db, request.params.id) }));
  });

  app.post<{ Body: CreateInput }>('/api/v1/tasks', async (request, reply) => {
    await respond(reply, () => {
      reply.code(201);
      return { task: createTask(db, request.body ?? {}, wallClockNow(env.timeZone)) };
    });
  });

  app.patch<{ Params: { id: string }; Body: TaskInput }>('/api/v1/tasks/:id', async (request, reply) => {
    await respond(reply, () => ({ task: updateTask(db, request.params.id, request.body ?? {}) }));
  });

  app.delete<{ Params: { id: string } }>('/api/v1/tasks/:id', async (request, reply) => {
    await respond(reply, () => ({ task: trashTask(db, request.params.id) }));
  });

  app.post<{ Params: { id: string } }>('/api/v1/tasks/:id/restore', async (request, reply) => {
    await respond(reply, () => ({ task: restoreTask(db, request.params.id) }));
  });

  app.post<{ Params: { id: string }; Body: CompleteBody }>('/api/v1/tasks/:id/complete', async (request, reply) => {
    const completedAt = request.body?.completedAt ?? new Date().toISOString();
    await respond(reply, () => completeTaskAt(db, request.params.id, completedAt));
  });

  app.get('/api/v1/lists', async (_request, reply) => {
    reply.send({ lists: listLists(db) });
  });
}

async function respond(reply: FastifyReply, run: () => unknown): Promise<void> {
  try {
    reply.send(run());
  } catch (err) {
    if (err instanceof TaskServiceError) {
      reply.code(err.code === 'not_found' ? 404 : 400).send({ error: err.code, message: err.message });
      return;
    }
    throw err;
  }
}

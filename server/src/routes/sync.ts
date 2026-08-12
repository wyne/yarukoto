import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { FolderDef, ListDef, Task } from '../../../shared/types';
import { env } from '../env';
import { FolderRow, ListRow, TaskRow, folderFromRow, listFromRow, taskFromRow, upsertTask } from '../model';

interface SyncPushBody {
  tasks?: Task[];
  lists?: ListDef[];
  folders?: FolderDef[];
}

export function registerSyncRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get<{ Querystring: { since?: string } }>('/api/v1/sync', async (request, reply) => {
    const since = request.query.since;
    const now = new Date().toISOString();

    if (since) {
      const cutoff = new Date(Date.now() - env.trashRetentionDays * 24 * 60 * 60 * 1000).toISOString();
      if (since < cutoff) {
        reply.code(409).send({ error: 'since_too_old', message: 'Client must re-hydrate fully.' });
        return;
      }
    }

    const cursor = since ?? '';
    const tasks = (db.prepare('SELECT * FROM tasks WHERE updated_at > ? ORDER BY updated_at').all(cursor) as TaskRow[]).map(
      taskFromRow
    );
    const lists = (db.prepare('SELECT * FROM lists WHERE updated_at > ? ORDER BY updated_at').all(cursor) as ListRow[]).map(
      listFromRow
    );
    const folders = (
      db.prepare('SELECT * FROM folders WHERE updated_at > ? ORDER BY updated_at').all(cursor) as FolderRow[]
    ).map(folderFromRow);

    reply.send({ now, tasks, lists, folders });
  });

  app.post<{ Body: SyncPushBody }>('/api/v1/sync', async (request, reply) => {
    const { tasks = [], lists = [], folders = [] } = request.body ?? {};

    const acceptedTasks: Task[] = [];
    const acceptedLists: ListDef[] = [];
    const acceptedFolders: FolderDef[] = [];

    const run = db.transaction(() => {
      for (const task of tasks) {
        const op = task.deletedAt ? 'delete' : 'update';
        acceptedTasks.push(upsertTask(db, task, op));
      }
      for (const list of lists) {
        acceptedLists.push(upsertList(db, list));
      }
      for (const folder of folders) {
        acceptedFolders.push(upsertFolder(db, folder));
      }
    });
    run();

    reply.send({ now: new Date().toISOString(), tasks: acceptedTasks, lists: acceptedLists, folders: acceptedFolders });
  });
}

function upsertList(db: Database.Database, list: ListDef): ListDef {
  const existing = db.prepare('SELECT updated_at FROM lists WHERE id = ?').get(list.id) as { updated_at: string } | undefined;
  if (existing && existing.updated_at >= list.updatedAt) {
    return listFromRow(db.prepare('SELECT * FROM lists WHERE id = ?').get(list.id) as ListRow);
  }
  db.prepare(
    `INSERT INTO lists (id, name, color, folder_id, updated_at, deleted_at) VALUES (@id, @name, @color, @folderId, @updatedAt, @deletedAt)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, folder_id = excluded.folder_id,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`
  ).run({ ...list, deletedAt: list.deletedAt ?? null });
  return list;
}

function upsertFolder(db: Database.Database, folder: FolderDef): FolderDef {
  const existing = db.prepare('SELECT updated_at FROM folders WHERE id = ?').get(folder.id) as { updated_at: string } | undefined;
  if (existing && existing.updated_at >= folder.updatedAt) {
    return folderFromRow(db.prepare('SELECT * FROM folders WHERE id = ?').get(folder.id) as FolderRow);
  }
  db.prepare(
    `INSERT INTO folders (id, name, updated_at, deleted_at) VALUES (@id, @name, @updatedAt, @deletedAt)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`
  ).run({ ...folder, deletedAt: folder.deletedAt ?? null });
  return folder;
}

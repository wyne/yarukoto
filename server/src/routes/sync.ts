import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { FolderDef, ListDef, Task, ViewPref } from '../../../shared/types';
import { env } from '../env';
import {
  FolderRow,
  ListRow,
  TaskRow,
  ViewPrefRow,
  folderFromRow,
  listFromRow,
  taskFromRow,
  upsertTask,
  viewPrefFromRow,
} from '../model';

interface SyncPushBody {
  tasks?: Task[];
  lists?: ListDef[];
  folders?: FolderDef[];
  viewPrefs?: ViewPref[];
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
    const viewPrefs = (
      db.prepare('SELECT * FROM view_prefs WHERE updated_at > ? ORDER BY updated_at').all(cursor) as ViewPrefRow[]
    ).map(viewPrefFromRow);

    reply.send({ now, tasks, lists, folders, viewPrefs });
  });

  app.post<{ Body: SyncPushBody }>('/api/v1/sync', async (request, reply) => {
    const { tasks = [], lists = [], folders = [], viewPrefs = [] } = request.body ?? {};

    const acceptedTasks: Task[] = [];
    const acceptedLists: ListDef[] = [];
    const acceptedFolders: FolderDef[] = [];
    const acceptedViewPrefs: ViewPref[] = [];

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
      for (const pref of viewPrefs) {
        acceptedViewPrefs.push(upsertViewPref(db, pref));
      }
    });
    run();

    reply.send({
      now: new Date().toISOString(),
      tasks: acceptedTasks,
      lists: acceptedLists,
      folders: acceptedFolders,
      viewPrefs: acceptedViewPrefs,
    });
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

function upsertViewPref(db: Database.Database, pref: ViewPref): ViewPref {
  const existing = db.prepare('SELECT updated_at FROM view_prefs WHERE id = ?').get(pref.id) as
    | { updated_at: string }
    | undefined;
  if (existing && existing.updated_at >= pref.updatedAt) {
    return viewPrefFromRow(db.prepare('SELECT * FROM view_prefs WHERE id = ?').get(pref.id) as ViewPrefRow);
  }
  db.prepare(
    `INSERT INTO view_prefs (id, group_by, sort_by, updated_at, deleted_at) VALUES (@id, @groupBy, @sortBy, @updatedAt, @deletedAt)
     ON CONFLICT(id) DO UPDATE SET group_by = excluded.group_by, sort_by = excluded.sort_by,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`
  ).run({ ...pref, deletedAt: pref.deletedAt ?? null });
  // Read back so an unrecognised grouping or sort is normalised the same way a
  // pull would normalise it, rather than the pusher keeping a value nothing else sees.
  return viewPrefFromRow(db.prepare('SELECT * FROM view_prefs WHERE id = ?').get(pref.id) as ViewPrefRow);
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

import { FastifyInstance, FastifyReply } from 'fastify';
import Database from 'better-sqlite3';
import { FolderDef, ListDef, SavedFilter, Task, ViewPref } from '@yarukoto/domain/types';
import { toISODate } from '@yarukoto/domain/dates';
import { completeRepeating } from '@yarukoto/domain/recurrence';
import { env } from '../env';
import { wallClockNow } from '../clock';
import { Viewer, listVisibleSql, taskVisibleSql, viewerParams } from '../access';
import { viewerOf } from '../viewer';
import {
  FolderRow,
  ListRow,
  SavedFilterRow,
  TaskRow,
  ViewPrefRow,
  folderFromRow,
  listFromRow,
  savedFilterFromRow,
  taskFromRow,
  upsertTask,
  viewPrefFromRow,
} from '../model';

interface SyncPushBody {
  tasks?: Task[];
  lists?: ListDef[];
  folders?: FolderDef[];
  viewPrefs?: ViewPref[];
  savedFilters?: SavedFilter[];
}

/**
 * Whole-row sync for a person's app. Everything read and written here is scoped
 * to the viewer through `access.ts`: they pull what they can see, and a push
 * that touches something they can't is dropped rather than applied.
 *
 * Household integrations don't sync — they hold no local copy, and use the
 * field-level task API instead.
 */
export function registerSyncRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get<{ Querystring: { since?: string } }>('/api/v1/sync', async (request, reply) => {
    const viewer = syncViewer(request.viewer, reply);
    if (!viewer) return;
    const since = request.query.since;
    // The cursor handed back is one millisecond behind the clock. A write that
    // lands later in this same millisecond is stamped with it, and the next
    // pull asks for rows strictly after the cursor — so a cursor of "now"
    // would skip that write for good. Rows stamped in the overlap come back
    // twice instead, which last-write-wins makes harmless.
    const now = new Date(Date.now() - 1).toISOString();

    if (since) {
      const cutoff = new Date(Date.now() - env.trashRetentionDays * 24 * 60 * 60 * 1000).toISOString();
      if (since < cutoff) {
        reply.code(409).send({ error: 'since_too_old', message: 'Client must re-hydrate fully.' });
        return;
      }
    }

    // Filter on server_updated_at, never updated_at: the latter is the *client's*
    // clock, while `now` above is this server's. Comparing across those two
    // clocks silently drops any record written by a client running behind the
    // server — it lands older than a cursor already in another client's hand,
    // and no incremental pull ever returns it again.
    const cursor = since ?? '';
    const params = { ...viewerParams(viewer), cursor };

    // Rows that changed but are no longer visible — a list unshared, a task moved
    // into someone's private list, a person removed — come back as ids under
    // `removed`, so a client holding a copy knows to drop it. The writes that
    // change visibility bump `server_updated_at` on every row they affect,
    // which is what puts those rows in this window at all. A full hydrate has
    // nothing to drop.
    const taskRows = db
      .prepare(
        `SELECT *, ${taskVisibleSql(viewer)} AS visible FROM tasks
         WHERE server_updated_at > @cursor ORDER BY server_updated_at`
      )
      .all(params) as (TaskRow & { visible: number })[];
    const listRows = db
      .prepare(
        `SELECT *, ${listVisibleSql(viewer)} AS visible FROM lists
         WHERE server_updated_at > @cursor ORDER BY server_updated_at`
      )
      .all(params) as (ListRow & { visible: number })[];
    const folders = (
      db
        .prepare('SELECT * FROM folders WHERE owner_id = @viewerId AND server_updated_at > @cursor ORDER BY server_updated_at')
        .all(params) as FolderRow[]
    ).map(folderFromRow);
    const viewPrefs = (
      db
        .prepare(
          'SELECT * FROM view_prefs WHERE owner_id = @viewerId AND server_updated_at > @cursor ORDER BY server_updated_at'
        )
        .all(params) as ViewPrefRow[]
    ).map(viewPrefFromRow);
    const savedFilters = (
      db
        .prepare(
          'SELECT * FROM saved_filters WHERE owner_id = @viewerId AND server_updated_at > @cursor ORDER BY server_updated_at'
        )
        .all(params) as SavedFilterRow[]
    ).map(savedFilterFromRow);

    reply.send({
      now,
      tasks: taskRows.filter((r) => r.visible).map(taskFromRow),
      lists: listRows.filter((r) => r.visible).map((r) => listFromRow(r, viewer.userId)),
      folders,
      viewPrefs,
      savedFilters,
      removed: {
        tasks: since ? taskRows.filter((r) => !r.visible).map((r) => r.id) : [],
        lists: since ? listRows.filter((r) => !r.visible).map((r) => r.id) : [],
      },
    });
  });

  app.post<{ Body: SyncPushBody }>('/api/v1/sync', async (request, reply) => {
    const viewer = syncViewer(request.viewer, reply);
    if (!viewer) return;
    const { tasks = [], lists = [], folders = [], viewPrefs = [], savedFilters = [] } = request.body ?? {};

    const acceptedTasks: Task[] = [];
    const acceptedLists: ListDef[] = [];
    const acceptedFolders: FolderDef[] = [];
    const acceptedViewPrefs: ViewPref[] = [];
    const acceptedSavedFilters: SavedFilter[] = [];

    const run = db.transaction(() => {
      // Lists first, so a task pushed into a list created in the same batch
      // finds it already visible.
      for (const list of lists) {
        const accepted = upsertList(db, list, viewer);
        if (accepted) acceptedLists.push(accepted);
      }
      for (const task of tasks) {
        const accepted = pushTask(db, task, viewer);
        if (accepted) acceptedTasks.push(accepted);
      }
      for (const folder of folders) {
        const accepted = upsertFolder(db, folder, viewer.userId);
        if (accepted) acceptedFolders.push(accepted);
      }
      for (const pref of viewPrefs) {
        acceptedViewPrefs.push(upsertViewPref(db, pref, viewer.userId));
      }
      for (const filter of savedFilters) {
        const accepted = upsertSavedFilter(db, filter, viewer.userId);
        if (accepted) acceptedSavedFilters.push(accepted);
      }
    });
    run();

    reply.send({
      now: new Date().toISOString(),
      tasks: acceptedTasks,
      lists: acceptedLists,
      folders: acceptedFolders,
      viewPrefs: acceptedViewPrefs,
      savedFilters: acceptedSavedFilters,
    });
  });
}

type PersonViewer = Extract<Viewer, { kind: 'user' }>;

function syncViewer(viewer: Viewer | undefined, reply: FastifyReply): PersonViewer | null {
  const resolved = viewerOf({ viewer });
  if (resolved.kind === 'user') return resolved;
  reply.code(403).send({ error: 'forbidden', message: 'Integrations use the task API, not sync.' });
  return null;
}

function taskVisible(db: Database.Database, id: string, viewer: Viewer): boolean {
  return !!db.prepare(`SELECT 1 FROM tasks WHERE id = @id AND ${taskVisibleSql(viewer)}`).get({ ...viewerParams(viewer), id });
}

function listVisible(db: Database.Database, id: string, viewer: Viewer): boolean {
  return !!db.prepare(`SELECT 1 FROM lists WHERE id = @id AND ${listVisibleSql(viewer)}`).get({ ...viewerParams(viewer), id });
}

/**
 * A pushed task is applied only if the viewer can see the stored row (or it is
 * new) and can see where it is going. Anything else is dropped: the client
 * keeps its copy, and the next pull's `removed` tells it the row isn't its to
 * hold.
 */
function pushTask(db: Database.Database, task: Task, viewer: PersonViewer): Task | null {
  const existing = db.prepare('SELECT deleted_at FROM tasks WHERE id = ?').get(task.id) as
    | { deleted_at: string | null }
    | undefined;
  if (existing && !taskVisible(db, task.id, viewer)) return null;
  if (task.listId !== null && !listVisible(db, task.listId, viewer)) return null;
  if (task.assigneeId && !db.prepare('SELECT 1 FROM users WHERE id = ?').get(task.assigneeId)) {
    // An assignee who doesn't exist is dropped, not stored.
    task = { ...task, assigneeId: null };
  }
  const op = !existing ? 'create' : task.deletedAt ? 'delete' : existing.deleted_at ? 'restore' : 'update';
  const rolled = rollForOlderClient(db, task);
  if (rolled) {
    upsertTask(db, rolled.occurrence, 'create', viewer.userId);
    return upsertTask(db, rolled.series, 'update', viewer.userId);
  }
  const accepted = upsertTask(db, task, op, viewer.userId);
  // The Inbox is per person, so a task filed there is filed in the mover's —
  // otherwise moving a shared task to your Inbox would hand it to whoever
  // created it, and it would vanish from your screen.
  if (existing && task.listId === null) {
    db.prepare('UPDATE tasks SET owner_id = ? WHERE id = ? AND list_id IS NULL').run(viewer.userId, task.id);
  }
  return accepted;
}

/**
 * An app from before repeats knows nothing of them, so checking off a repeating
 * task there arrives as a plain completion — without the `repeat` field at all.
 * Rolling it forward here keeps the series going for the rest of the household.
 * A client that does know (the field is present) has already done this itself
 * and pushed both rows, so it is never rolled twice.
 */
function rollForOlderClient(db: Database.Database, task: Task) {
  if (!task.completed || Object.prototype.hasOwnProperty.call(task, 'repeat')) return null;
  const stored = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as TaskRow | undefined;
  if (!stored || stored.completed || stored.updated_at >= task.updatedAt) return null;
  const repeat = taskFromRow(stored).repeat;
  if (!repeat) return null;
  const at = task.completedAt ?? task.updatedAt;
  return completeRepeating(
    { ...task, repeat, completed: false, completedAt: undefined },
    task.updatedAt,
    toISODate(wallClockNow(env.timeZone, new Date(at)))
  );
}

/**
 * Lists are the one record two people can edit. The owner writes everything;
 * someone else may rename or recolour a shared list, but its sharing, folder
 * and position stay the owner's — their nav shows it at the root, so a drag
 * there must not move it in the owner's.
 */
function upsertList(db: Database.Database, list: ListDef, viewer: PersonViewer): ListDef | null {
  const existing = db.prepare('SELECT * FROM lists WHERE id = ?').get(list.id) as ListRow | undefined;
  if (existing && !listVisible(db, list.id, viewer)) return null;
  if (existing && existing.updated_at >= list.updatedAt) return listFromRow(existing, viewer.userId);

  const owner = existing ? existing.owner_id : viewer.userId;
  const own = owner === viewer.userId;
  // `shared` absent is a client from before households, which must not unshare.
  const shared = own && typeof list.shared === 'boolean' ? (list.shared ? 1 : 0) : (existing?.shared ?? 0);
  const serverUpdatedAt = new Date().toISOString();

  // Every field the record carries has to appear in all three places below.
  // better-sqlite3 binds by walking the *statement's* parameters and looking each
  // one up on the object — properties the SQL doesn't name are ignored in silence.
  // So a column missed here doesn't throw: the push returns 200 and the value is
  // dropped on the floor, surfacing much later as "my ordering doesn't stick".
  db.prepare(
    `INSERT INTO lists (id, name, color, folder_id, order_key, updated_at, deleted_at, server_updated_at, owner_id, shared)
     VALUES (@id, @name, @color, @folderId, @order, @updatedAt, @deletedAt, @serverUpdatedAt, @ownerId, @shared)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, folder_id = excluded.folder_id,
       order_key = excluded.order_key,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
       server_updated_at = excluded.server_updated_at, shared = excluded.shared`
  ).run({
    id: list.id,
    name: list.name,
    color: list.color,
    folderId: own ? list.folderId : existing!.folder_id,
    order: own ? list.order : existing!.order_key,
    updatedAt: list.updatedAt,
    // Only the owner deletes a list; anyone else's delete is just their view.
    deletedAt: own ? (list.deletedAt ?? null) : existing!.deleted_at,
    serverUpdatedAt,
    ownerId: owner,
    shared,
  });
  if (existing && existing.shared !== shared) {
    // Sharing changes who sees every task in the list, so they all go back
    // out on the next pull — as rows to some people and as `removed` to others.
    db.prepare('UPDATE tasks SET server_updated_at = ? WHERE list_id = ?').run(serverUpdatedAt, list.id);
  }
  return listFromRow(db.prepare('SELECT * FROM lists WHERE id = ?').get(list.id) as ListRow, viewer.userId);
}

function upsertViewPref(db: Database.Database, pref: ViewPref, ownerId: string): ViewPref {
  const read = () =>
    viewPrefFromRow(
      db.prepare('SELECT * FROM view_prefs WHERE owner_id = ? AND id = ?').get(ownerId, pref.id) as ViewPrefRow
    );
  const existing = db.prepare('SELECT updated_at FROM view_prefs WHERE owner_id = ? AND id = ?').get(ownerId, pref.id) as
    | { updated_at: string }
    | undefined;
  if (existing && existing.updated_at >= pref.updatedAt) return read();
  // Arrangements travel as JSON, like a task's tags and subtasks.
  db.prepare(
    `INSERT INTO view_prefs (owner_id, id, group_by, sort_by, arrangements, updated_at, deleted_at, server_updated_at)
     VALUES (@ownerId, @id, @groupBy, @sortBy, @arrangements, @updatedAt, @deletedAt, @serverUpdatedAt)
     ON CONFLICT(owner_id, id) DO UPDATE SET group_by = excluded.group_by, sort_by = excluded.sort_by,
       arrangements = excluded.arrangements,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
       server_updated_at = excluded.server_updated_at`
  ).run({
    ownerId,
    id: pref.id,
    groupBy: pref.groupBy,
    sortBy: pref.sortBy,
    updatedAt: pref.updatedAt,
    deletedAt: pref.deletedAt ?? null,
    arrangements: JSON.stringify(pref.arrangements ?? {}),
    serverUpdatedAt: new Date().toISOString(),
  });
  // Read back so an unrecognised grouping or sort is normalised the same way a
  // pull would normalise it, rather than the pusher keeping a value nothing else sees.
  return read();
}

function upsertFolder(db: Database.Database, folder: FolderDef, ownerId: string): FolderDef | null {
  const existing = db.prepare('SELECT * FROM folders WHERE id = ?').get(folder.id) as FolderRow & { owner_id: string } | undefined;
  if (existing && existing.owner_id !== ownerId) return null;
  if (existing && existing.updated_at >= folder.updatedAt) return folderFromRow(existing);
  // Same silent-bind caveat as upsertList above.
  db.prepare(
    `INSERT INTO folders (id, name, order_key, updated_at, deleted_at, server_updated_at, owner_id)
     VALUES (@id, @name, @order, @updatedAt, @deletedAt, @serverUpdatedAt, @ownerId)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, order_key = excluded.order_key,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at, server_updated_at = excluded.server_updated_at`
  ).run({
    id: folder.id,
    name: folder.name,
    order: folder.order,
    updatedAt: folder.updatedAt,
    deletedAt: folder.deletedAt ?? null,
    serverUpdatedAt: new Date().toISOString(),
    ownerId,
  });
  return folder;
}

function upsertSavedFilter(db: Database.Database, filter: SavedFilter, ownerId: string): SavedFilter | null {
  const existing = db.prepare('SELECT updated_at, owner_id FROM saved_filters WHERE id = ?').get(filter.id) as
    | { updated_at: string; owner_id: string }
    | undefined;
  if (existing && existing.owner_id !== ownerId) return null;
  if (existing && existing.updated_at >= filter.updatedAt) {
    return savedFilterFromRow(db.prepare('SELECT * FROM saved_filters WHERE id = ?').get(filter.id) as SavedFilterRow);
  }
  // Same silent-bind caveat as upsertList above.
  db.prepare(
    `INSERT INTO saved_filters (id, name, criteria, order_key, updated_at, deleted_at, server_updated_at, owner_id)
     VALUES (@id, @name, @criteria, @order, @updatedAt, @deletedAt, @serverUpdatedAt, @ownerId)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, criteria = excluded.criteria,
       order_key = excluded.order_key, updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at, server_updated_at = excluded.server_updated_at`
  ).run({
    id: filter.id,
    name: filter.name,
    criteria: JSON.stringify(filter.criteria ?? {}),
    order: filter.order ?? 0,
    updatedAt: filter.updatedAt,
    deletedAt: filter.deletedAt ?? null,
    serverUpdatedAt: new Date().toISOString(),
    ownerId,
  });
  // Read back so criteria are normalised the way a pull would see them.
  return savedFilterFromRow(db.prepare('SELECT * FROM saved_filters WHERE id = ?').get(filter.id) as SavedFilterRow);
}

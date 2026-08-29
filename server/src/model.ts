import Database from 'better-sqlite3';
import { FolderDef, GROUP_BY_VALUES, GroupBy, ListDef, SORT_BY_VALUES, SortBy, Task, ViewPref } from '../../shared/types';
import { env } from './env';

export interface TaskRow {
  id: string;
  title: string;
  notes: string;
  priority: string;
  due_date: string | null;
  due_time: string | null;
  reminders: string;
  list_id: string | null;
  tags: string;
  subtasks: string;
  completed: number;
  completed_at: string | null;
  created_at: string;
  order_key: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface ListRow {
  id: string;
  name: string;
  color: string;
  /** NULL = a list at the root of the nav, not inside a folder. */
  folder_id: string | null;
  order_key: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface FolderRow {
  id: string;
  name: string;
  order_key: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface ViewPrefRow {
  id: string;
  group_by: string;
  sort_by: string;
  arrangements: string;
  updated_at: string;
  deleted_at: string | null;
}

function asReminders(value: string): Task['reminders'] {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const reminder = item as { id?: unknown; offsetDays?: unknown; time?: unknown };
      if (
        typeof reminder.id !== 'string' ||
        typeof reminder.offsetDays !== 'number' ||
        !Number.isInteger(reminder.offsetDays) ||
        reminder.offsetDays < 0 ||
        reminder.offsetDays > 3650 ||
        typeof reminder.time !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time)
      ) {
        return [];
      }
      const key = `${reminder.offsetDays}:${reminder.time}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ id: reminder.id, offsetDays: reminder.offsetDays, time: reminder.time }];
    });
  } catch {
    return [];
  }
}

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    priority: row.priority as Task['priority'],
    dueDate: row.due_date ?? undefined,
    dueTime: row.due_time ?? undefined,
    reminders: row.due_date ? asReminders(row.reminders) : undefined,
    listId: row.list_id,
    tags: JSON.parse(row.tags),
    subtasks: JSON.parse(row.subtasks),
    completed: !!row.completed,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    order: row.order_key,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function listFromRow(row: ListRow): ListDef {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    folderId: row.folder_id,
    order: row.order_key,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function folderFromRow(row: FolderRow): FolderDef {
  return {
    id: row.id,
    name: row.name,
    order: row.order_key,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

/**
 * An unrecognised grouping or sort — an older server meeting a newer client, or a
 * hand-rolled request — falls back to the default rather than being stored, so a
 * client can never be handed a value it has no way to render.
 */
function asGroupBy(value: string): GroupBy {
  return GROUP_BY_VALUES.includes(value as GroupBy) ? (value as GroupBy) : 'none';
}

function asSortBy(value: string): SortBy {
  return SORT_BY_VALUES.includes(value as SortBy) ? (value as SortBy) : 'manual';
}

/**
 * Arrangements are opaque to the server — it stores and returns them without
 * interpreting the keys. Unparseable JSON degrades to "nothing arranged" rather
 * than failing the pull, the same spirit as `asGroupBy` above.
 */
function asArrangements(value: string): ViewPref['arrangements'] {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function viewPrefFromRow(row: ViewPrefRow): ViewPref {
  return {
    id: row.id,
    groupBy: asGroupBy(row.group_by),
    sortBy: asSortBy(row.sort_by),
    arrangements: asArrangements(row.arrangements),
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function upsertTask(db: Database.Database, task: Task, op: 'create' | 'update' | 'delete' | 'restore'): Task {
  const existing = db.prepare('SELECT updated_at FROM tasks WHERE id = ?').get(task.id) as { updated_at: string } | undefined;
  if (existing && existing.updated_at >= task.updatedAt) {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as TaskRow;
    return taskFromRow(row);
  }

  db.prepare(
    `INSERT INTO tasks (id, title, notes, priority, due_date, due_time, reminders, list_id, tags, subtasks, completed, completed_at, created_at, order_key, updated_at, deleted_at, server_updated_at)
     VALUES (@id, @title, @notes, @priority, @dueDate, @dueTime, @reminders, @listId, @tags, @subtasks, @completed, @completedAt, @createdAt, @order, @updatedAt, @deletedAt, @serverUpdatedAt)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, notes = excluded.notes, priority = excluded.priority,
       due_date = excluded.due_date, due_time = excluded.due_time, reminders = excluded.reminders, list_id = excluded.list_id,
       tags = excluded.tags, subtasks = excluded.subtasks, completed = excluded.completed,
       completed_at = excluded.completed_at, created_at = excluded.created_at, order_key = excluded.order_key,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
       server_updated_at = excluded.server_updated_at`
  ).run({
    id: task.id,
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    dueDate: task.dueDate ?? null,
    dueTime: task.dueTime ?? null,
    reminders: JSON.stringify(task.dueDate ? (task.reminders ?? []) : []),
    listId: task.listId,
    tags: JSON.stringify(task.tags),
    subtasks: JSON.stringify(task.subtasks),
    completed: task.completed ? 1 : 0,
    completedAt: task.completedAt ?? null,
    createdAt: task.createdAt,
    order: task.order,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt ?? null,
    // Server clock, not the client's — this is what cursors compare against.
    serverUpdatedAt: new Date().toISOString(),
  });

  // A task can be changed again before its first sync. The record outbox then
  // sends only the latest snapshot, but activity should still preserve the
  // states we can infer with certainty: every task began active and incomplete.
  if (op === 'create' && (task.completed || task.deletedAt)) {
    recordRevision(
      db,
      {
        ...task,
        completed: false,
        completedAt: undefined,
        deletedAt: undefined,
        updatedAt: task.createdAt,
      },
      'create'
    );
    if (task.completed) {
      recordRevision(
        db,
        {
          ...task,
          deletedAt: undefined,
          updatedAt: task.completedAt ?? task.updatedAt,
        },
        'update'
      );
    }
    if (task.deletedAt) recordRevision(db, task, 'delete');
  } else {
    recordRevision(db, task, op);
  }
  return task;
}

export function recordRevision(db: Database.Database, task: Task, op: 'create' | 'update' | 'delete' | 'restore'): void {
  db.prepare('INSERT INTO task_revisions (task_id, snapshot, op, recorded_at) VALUES (?, ?, ?, ?)').run(
    task.id,
    JSON.stringify(task),
    op,
    new Date().toISOString()
  );
  pruneRevisions(db, task.id);
}

function pruneRevisions(db: Database.Database, taskId: string): void {
  const cap = env.historyRevisionsPerTask;
  if (cap <= 0) {
    db.prepare('DELETE FROM task_revisions WHERE task_id = ?').run(taskId);
    return;
  }
  db.prepare(
    `DELETE FROM task_revisions WHERE task_id = ? AND id NOT IN (
       SELECT id FROM task_revisions WHERE task_id = ? ORDER BY id DESC LIMIT ?
     )`
  ).run(taskId, taskId, cap);
}

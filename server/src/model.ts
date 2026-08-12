import Database from 'better-sqlite3';
import { FolderDef, ListDef, Task } from '../../shared/types';
import { env } from './env';

export interface TaskRow {
  id: string;
  title: string;
  notes: string;
  priority: string;
  due_date: string | null;
  due_time: string | null;
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
  folder_id: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FolderRow {
  id: string;
  name: string;
  updated_at: string;
  deleted_at: string | null;
}

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    priority: row.priority as Task['priority'],
    dueDate: row.due_date ?? undefined,
    dueTime: row.due_time ?? undefined,
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
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function folderFromRow(row: FolderRow): FolderDef {
  return {
    id: row.id,
    name: row.name,
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
    `INSERT INTO tasks (id, title, notes, priority, due_date, due_time, list_id, tags, subtasks, completed, completed_at, created_at, order_key, updated_at, deleted_at)
     VALUES (@id, @title, @notes, @priority, @dueDate, @dueTime, @listId, @tags, @subtasks, @completed, @completedAt, @createdAt, @order, @updatedAt, @deletedAt)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, notes = excluded.notes, priority = excluded.priority,
       due_date = excluded.due_date, due_time = excluded.due_time, list_id = excluded.list_id,
       tags = excluded.tags, subtasks = excluded.subtasks, completed = excluded.completed,
       completed_at = excluded.completed_at, created_at = excluded.created_at, order_key = excluded.order_key,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`
  ).run({
    id: task.id,
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    dueDate: task.dueDate ?? null,
    dueTime: task.dueTime ?? null,
    listId: task.listId,
    tags: JSON.stringify(task.tags),
    subtasks: JSON.stringify(task.subtasks),
    completed: task.completed ? 1 : 0,
    completedAt: task.completedAt ?? null,
    createdAt: task.createdAt,
    order: task.order,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt ?? null,
  });

  recordRevision(db, task, op);
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

import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { ListDef, Priority, SavedFilter, Task } from '../../shared/types';
import { parseQuickAdd } from '../../shared/quickAdd';
import { filterTasks } from '../../shared/taskFilter';
import {
  ListRow,
  SavedFilterRow,
  TaskRow,
  listFromRow,
  recordRevision,
  savedFilterFromRow,
  taskFromRow,
  upsertTask,
} from './model';

/**
 * Field-level task writes, for callers that are not a syncing client: the REST
 * task routes, the MCP tools, and the notification action endpoint.
 *
 * `POST /sync` upserts *whole rows*, which is right for a client that holds the
 * complete record and wrong for anything else — a caller that sends back a
 * partial task wipes every field it left out. Every write here instead reads the
 * stored row, changes only the fields it was given, and writes the merged row
 * back through `upsertTask`, so history and the pull cursor behave exactly as
 * they do for a synced edit. Clients pick the change up on their next pull.
 */

export const PRIORITIES: readonly Priority[] = ['none', 'low', 'medium', 'high'];

export type TaskStatus = 'open' | 'completed' | 'all' | 'trash';

export class TaskServiceError extends Error {
  constructor(
    readonly code: 'not_found' | 'bad_request',
    message: string
  ) {
    super(message);
  }
}

export interface TaskFilter {
  status?: TaskStatus;
  /** A list id, or null for the Inbox. Undefined = every list. */
  listId?: string | null;
  tag?: string;
  /** Inclusive ISO dates. Either bound excludes tasks with no due date. */
  dueFrom?: string;
  dueTo?: string;
  /** Case-insensitive substring of the title or notes. */
  query?: string;
  limit?: number;
}

export interface TaskInput {
  title?: string;
  notes?: string;
  priority?: Priority;
  /** ISO date; null clears it (and the time, and the reminders anchored to it). */
  dueDate?: string | null;
  /** 24h 'HH:mm'; null makes the task all-day. */
  dueTime?: string | null;
  /** null = Inbox. */
  listId?: string | null;
  tags?: string[];
  completed?: boolean;
}

export interface CreateInput extends TaskInput {
  /**
   * Quick-add text, e.g. "pay rent fri 6pm #home !high ~admin". Parsed with the
   * app's own parser; explicit fields win over anything it finds.
   */
  text?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function getTask(db: Database.Database, id: string): Task {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  if (!row) throw new TaskServiceError('not_found', `No task with id ${id}`);
  return taskFromRow(row);
}

export function listTasks(db: Database.Database, filter: TaskFilter = {}): Task[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  const status = filter.status ?? 'open';

  if (status === 'trash') where.push('deleted_at IS NOT NULL');
  else where.push('deleted_at IS NULL');
  if (status === 'open') where.push('completed = 0');
  if (status === 'completed') where.push('completed = 1');

  if (filter.listId === null) where.push('list_id IS NULL');
  else if (filter.listId !== undefined) {
    where.push('list_id = @listId');
    params.listId = filter.listId;
  }
  if (filter.tag) {
    where.push('EXISTS (SELECT 1 FROM json_each(tasks.tags) WHERE json_each.value = @tag)');
    params.tag = normalizeTag(filter.tag);
  }
  if (filter.dueFrom) {
    where.push('due_date >= @dueFrom');
    params.dueFrom = checkDate(filter.dueFrom, 'dueFrom');
  }
  if (filter.dueTo) {
    where.push('due_date <= @dueTo');
    params.dueTo = checkDate(filter.dueTo, 'dueTo');
  }
  if (filter.query) {
    where.push("(title LIKE @query ESCAPE '\\' OR notes LIKE @query ESCAPE '\\')");
    params.query = `%${filter.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  params.limit = Math.min(Math.max(1, Math.floor(filter.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);

  const rows = db
    .prepare(
      `SELECT * FROM tasks WHERE ${where.join(' AND ')}
       ORDER BY due_date IS NULL, due_date, due_time IS NULL, due_time, order_key
       LIMIT @limit`
    )
    .all(params) as TaskRow[];
  return rows.map(taskFromRow);
}

export function listLists(db: Database.Database): ListDef[] {
  const rows = db.prepare('SELECT * FROM lists WHERE deleted_at IS NULL ORDER BY order_key').all() as ListRow[];
  return rows.map(listFromRow);
}

/** `today` is the user's wall-clock date, for resolving the quick-add text. */
export function listSavedFilters(db: Database.Database): SavedFilter[] {
  const rows = db
    .prepare('SELECT * FROM saved_filters WHERE deleted_at IS NULL ORDER BY order_key')
    .all() as SavedFilterRow[];
  return rows.map(savedFilterFromRow);
}

/**
 * The tasks a saved filter admits right now, in the app's own order.
 *
 * Evaluated with the shared `filterTasks`, not translated to SQL, so a filter
 * cannot mean one thing on the phone and another here. `now` must already read
 * as the user's wall clock (`wallClockNow`), since "today" is a calendar day.
 */
export function savedFilterTasks(
  db: Database.Database,
  id: string,
  now: Date
): { filter: SavedFilter; tasks: Task[] } {
  const row = db.prepare('SELECT * FROM saved_filters WHERE id = ? AND deleted_at IS NULL').get(id) as
    | SavedFilterRow
    | undefined;
  if (!row) throw new TaskServiceError('not_found', `No saved filter with id ${id}`);
  const filter = savedFilterFromRow(row);
  const tasks = (db.prepare('SELECT * FROM tasks WHERE deleted_at IS NULL').all() as TaskRow[]).map(taskFromRow);
  const lists = (db.prepare('SELECT * FROM lists').all() as ListRow[]).map(listFromRow);
  return { filter, tasks: filterTasks(tasks, filter.criteria, { lists, now }) };
}

export function createTask(db: Database.Database, input: CreateInput, today: Date): Task {
  const parsed = input.text ? parseQuickAdd(input.text, today) : undefined;
  const title = (input.title ?? parsed?.title ?? '').trim();
  if (!title) throw new TaskServiceError('bad_request', 'A task needs a title');

  let listId = input.listId;
  if (listId === undefined && parsed?.listName) {
    const name = parsed.listName.toLowerCase();
    listId = listLists(db).find((l) => l.name.toLowerCase() === name)?.id;
    if (listId === undefined) {
      throw new TaskServiceError('bad_request', `No list named "${parsed.listName}"`);
    }
  }

  const now = new Date().toISOString();
  const base: Task = {
    id: `t-${crypto.randomUUID()}`,
    title,
    notes: '',
    priority: parsed && parsed.priority !== 'none' ? parsed.priority : 'none',
    dueDate: parsed?.dueDate,
    dueTime: parsed?.dueTime,
    reminders: [],
    listId: null,
    tags: parsed?.tags ?? [],
    subtasks: [],
    completed: false,
    createdAt: now,
    updatedAt: now,
    // The same key the app gives a new task, so it lands on top like one typed in.
    order: -Date.now(),
  };
  const task = applyInput(db, base, { ...input, title, listId }, now);
  return runWrite(db, task, 'create');
}

export function updateTask(db: Database.Database, id: string, input: TaskInput): Task {
  const current = getTask(db, id);
  if (current.deletedAt) throw new TaskServiceError('bad_request', 'Task is in the trash; restore it first');
  const updatedAt = stampAfter(current.updatedAt);
  return runWrite(db, applyInput(db, { ...current, updatedAt }, input, updatedAt), 'update');
}

export function trashTask(db: Database.Database, id: string): Task {
  const current = getTask(db, id);
  if (current.deletedAt) return current;
  const updatedAt = stampAfter(current.updatedAt);
  return runWrite(db, { ...current, deletedAt: updatedAt, updatedAt }, 'delete');
}

export function restoreTask(db: Database.Database, id: string): Task {
  const current = getTask(db, id);
  if (!current.deletedAt) return current;
  const updatedAt = stampAfter(current.updatedAt);
  return runWrite(db, { ...current, deletedAt: undefined, updatedAt }, 'restore');
}

/**
 * Completion stamped with a *device* clock — the notification action handlers.
 * Unlike the writes above, a stale tap loses to a later edit instead of being
 * forced through: a notification can sit on the lock screen for hours, and a
 * completion that old should not undo whatever happened to the task since.
 */
export function completeTaskAt(db: Database.Database, id: string, completedAt: string): { task: Task; applied: boolean } {
  if (Number.isNaN(Date.parse(completedAt))) {
    throw new TaskServiceError('bad_request', 'completedAt is not a timestamp');
  }
  const current = getTask(db, id);
  if (current.deletedAt) throw new TaskServiceError('not_found', `No task with id ${id}`);
  if (current.updatedAt >= completedAt) return { task: current, applied: false };

  const task: Task = { ...current, completed: true, completedAt, updatedAt: completedAt };
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
  return { task, applied: true };
}

function runWrite(db: Database.Database, task: Task, op: 'create' | 'update' | 'delete' | 'restore'): Task {
  return db.transaction(() => upsertTask(db, task, op))();
}

/**
 * A server-side edit is a deliberate, current change, so it must win the
 * last-write-wins comparison `upsertTask` makes. Normally "now" does; but a device
 * with a fast clock can leave an `updatedAt` in the future, and an edit stamped
 * before it would be dropped without a word. So never stamp at or before it.
 */
function stampAfter(previous: string): string {
  const now = Date.now();
  const prev = Date.parse(previous);
  return new Date(Number.isNaN(prev) || now > prev ? now : prev + 1).toISOString();
}

function applyInput(db: Database.Database, task: Task, input: TaskInput, stamp: string): Task {
  const out: Task = { ...task };

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new TaskServiceError('bad_request', 'A task needs a title');
    out.title = title;
  }
  if (input.notes !== undefined) out.notes = input.notes;
  if (input.priority !== undefined) {
    if (!PRIORITIES.includes(input.priority)) {
      throw new TaskServiceError('bad_request', `priority must be one of ${PRIORITIES.join(', ')}`);
    }
    out.priority = input.priority;
  }
  if (input.dueDate !== undefined) {
    out.dueDate = input.dueDate === null ? undefined : checkDate(input.dueDate, 'dueDate');
    // A time or a reminder means nothing without a date to hang it on.
    if (!out.dueDate) {
      out.dueTime = undefined;
      out.reminders = [];
    }
  }
  if (input.dueTime !== undefined) {
    if (input.dueTime === null) out.dueTime = undefined;
    else {
      if (!HHMM.test(input.dueTime)) throw new TaskServiceError('bad_request', 'dueTime must be 24h HH:mm');
      out.dueTime = input.dueTime;
    }
  }
  if (out.dueTime && !out.dueDate) throw new TaskServiceError('bad_request', 'dueTime needs a dueDate');
  if (input.listId !== undefined) {
    if (input.listId !== null && !listLists(db).some((l) => l.id === input.listId)) {
      throw new TaskServiceError('bad_request', `No list with id ${input.listId}`);
    }
    out.listId = input.listId;
  }
  if (input.tags !== undefined) out.tags = input.tags;
  out.tags = Array.from(new Set(out.tags.map(normalizeTag).filter(Boolean)));
  if (input.completed !== undefined && input.completed !== out.completed) {
    out.completed = input.completed;
    out.completedAt = input.completed ? stamp : undefined;
  }
  return out;
}

/** Tags are stored the way quick-add types them: lowercase, no leading '#'. */
function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

function checkDate(value: string, field: string): string {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TaskServiceError('bad_request', `${field} must be an ISO date (YYYY-MM-DD)`);
  }
  return value;
}

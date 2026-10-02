import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { ListDef, Priority, SavedFilter, Task, TaskRepeat } from '../../shared/types';
import { parseQuickAdd } from '../../shared/quickAdd';
import { toISODate } from '../../shared/dates';
import {
  completeRepeating,
  firstOccurrenceOnOrAfter,
  normalizeRepeat,
  parseRepeatPhrase,
  skipRepeating,
} from '../../shared/recurrence';
import { env } from './env';
import { wallClockNow } from './clock';
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
import { OWNER_VIEWER, Viewer, listVisibleSql, taskVisibleSql, viewerParams, viewerUserId } from './access';

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
 *
 * Every function takes the `Viewer` it acts for and sees only what they may
 * (see `access.ts`). The default is the household owner — the env token — which
 * is what every caller was before households; routes always pass the request's.
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
  /** A household member's id; null clears it. */
  assigneeId?: string | null;
  /**
   * How it repeats: `{ rule, from }`, an RRULE ("FREQ=WEEKLY;BYDAY=MO"), or a
   * phrase ("every weekday", "every! 3 days"). Null stops it. A repeat on a task
   * with no date starts it on the rule's first day from today.
   */
  repeat?: TaskRepeat | string | null;
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

export function getTask(db: Database.Database, id: string, viewer: Viewer = OWNER_VIEWER): Task {
  const row = db
    .prepare(`SELECT * FROM tasks WHERE id = @id AND ${taskVisibleSql(viewer)}`)
    .get({ ...viewerParams(viewer), id }) as TaskRow | undefined;
  if (!row) throw new TaskServiceError('not_found', `No task with id ${id}`);
  return taskFromRow(row);
}

export function listTasks(db: Database.Database, filter: TaskFilter = {}, viewer: Viewer = OWNER_VIEWER): Task[] {
  const where: string[] = [taskVisibleSql(viewer)];
  const params: Record<string, unknown> = { ...viewerParams(viewer) };
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

export function listLists(db: Database.Database, viewer: Viewer = OWNER_VIEWER): ListDef[] {
  const rows = db
    .prepare(`SELECT * FROM lists WHERE deleted_at IS NULL AND ${listVisibleSql(viewer)} ORDER BY order_key`)
    .all(viewerParams(viewer)) as ListRow[];
  return rows.map((row) => listFromRow(row, viewerUserId(viewer)));
}

/** `today` is the user's wall-clock date, for resolving the quick-add text. */
/**
 * A person's own saved filters. A household integration sees everyone's —
 * each still evaluated over shared lists only — since a filter is how someone
 * says "show this on the kitchen dashboard", and the integration belongs to no
 * one in particular. A removed person's filters go with them.
 */
export function listSavedFilters(db: Database.Database, viewer: Viewer = OWNER_VIEWER): SavedFilter[] {
  return (savedFilterRows(db, viewer).all(viewerParams(viewer)) as SavedFilterRow[]).map(savedFilterFromRow);
}

function savedFilterRows(db: Database.Database, viewer: Viewer, byId = false) {
  const scope =
    viewer.kind === 'household'
      ? 'owner_id IN (SELECT id FROM users WHERE deleted_at IS NULL)'
      : 'owner_id = @viewerId';
  return db.prepare(
    `SELECT * FROM saved_filters WHERE deleted_at IS NULL AND ${scope}${byId ? ' AND id = @id' : ''} ORDER BY order_key`
  );
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
  now: Date,
  viewer: Viewer = OWNER_VIEWER
): { filter: SavedFilter; tasks: Task[] } {
  const params = { ...viewerParams(viewer), id };
  const row = savedFilterRows(db, viewer, true).get(params) as SavedFilterRow | undefined;
  if (!row) throw new TaskServiceError('not_found', `No saved filter with id ${id}`);
  const filter = savedFilterFromRow(row);
  const tasks = (
    db.prepare(`SELECT * FROM tasks WHERE deleted_at IS NULL AND ${taskVisibleSql(viewer)}`).all(params) as TaskRow[]
  ).map(taskFromRow);
  const lists = (
    db.prepare(`SELECT * FROM lists WHERE ${listVisibleSql(viewer)}`).all(params) as ListRow[]
  ).map((r) => listFromRow(r, viewerUserId(viewer)));
  return { filter, tasks: filterTasks(tasks, filter.criteria, { lists, now }) };
}

export function createTask(
  db: Database.Database,
  input: CreateInput,
  today: Date,
  viewer: Viewer = OWNER_VIEWER
): Task {
  const parsed = input.text ? parseQuickAdd(input.text, today) : undefined;
  const title = (input.title ?? parsed?.title ?? '').trim();
  if (!title) throw new TaskServiceError('bad_request', 'A task needs a title');

  let listId = input.listId;
  if (listId === undefined && parsed?.listName) {
    const name = parsed.listName.toLowerCase();
    listId = listLists(db, viewer).find((l) => l.name.toLowerCase() === name)?.id;
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
    repeat: parsed?.repeat ?? null,
    listId: null,
    tags: parsed?.tags ?? [],
    subtasks: [],
    completed: false,
    createdAt: now,
    updatedAt: now,
    // The same key the app gives a new task, so it lands on top like one typed in.
    order: -Date.now(),
  };
  const task = applyInput(db, base, { ...input, title, listId }, now, viewer);
  // An integration has no Inbox, so its tasks have to go somewhere it can see.
  if (viewer.kind === 'household' && task.listId === null) {
    throw new TaskServiceError('bad_request', 'An integration must put a task in a shared list');
  }
  return runWrite(db, task, 'create', viewerUserId(viewer));
}

export function updateTask(db: Database.Database, id: string, input: TaskInput, viewer: Viewer = OWNER_VIEWER): Task {
  const current = getTask(db, id, viewer);
  if (current.deletedAt) throw new TaskServiceError('bad_request', 'Task is in the trash; restore it first');
  const updatedAt = stampAfter(current.updatedAt);
  const next = applyInput(db, { ...current, updatedAt }, input, updatedAt, viewer);
  if (viewer.kind === 'household' && next.listId === null) {
    throw new TaskServiceError('bad_request', 'An integration must keep a task in a shared list');
  }
  // Checking off a repeating task moves it to its next date and keeps the
  // occurrence as a completed copy — what the app does, so Home Assistant or an
  // AI ticking it off leaves the same rows behind as a tap on the phone.
  const rolled =
    input.completed === true && !current.completed
      ? completeRepeating({ ...next, completed: false, completedAt: undefined }, updatedAt, todayISO())
      : null;
  if (rolled) {
    return db.transaction(() => {
      upsertTask(db, rolled.occurrence, 'create', occurrenceOwner(db, id));
      return upsertTask(db, rolled.series, 'update');
    })();
  }
  const task = runWrite(db, next, 'update');
  // Filed into the Inbox means filed into the mover's, as in sync.
  if (current.listId !== null && task.listId === null && viewer.kind === 'user') {
    db.prepare('UPDATE tasks SET owner_id = ? WHERE id = ?').run(viewer.userId, id);
  }
  return task;
}

export function trashTask(db: Database.Database, id: string, viewer: Viewer = OWNER_VIEWER): Task {
  const current = getTask(db, id, viewer);
  if (current.deletedAt) return current;
  const updatedAt = stampAfter(current.updatedAt);
  return runWrite(db, { ...current, deletedAt: updatedAt, updatedAt }, 'delete');
}

export function restoreTask(db: Database.Database, id: string, viewer: Viewer = OWNER_VIEWER): Task {
  const current = getTask(db, id, viewer);
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
export function completeTaskAt(
  db: Database.Database,
  id: string,
  completedAt: string,
  viewer: Viewer = OWNER_VIEWER
): { task: Task; applied: boolean } {
  if (Number.isNaN(Date.parse(completedAt))) {
    throw new TaskServiceError('bad_request', 'completedAt is not a timestamp');
  }
  const current = getTask(db, id, viewer);
  if (current.deletedAt) throw new TaskServiceError('not_found', `No task with id ${id}`);
  if (current.updatedAt >= completedAt) return { task: current, applied: false };

  // The occurrence's id is derived from the series and its date, so when the
  // app later folds in the same tap it writes these same two rows, not a second
  // copy and a second step forward.
  const rolled = completeRepeating(current, completedAt, toISODate(wallClockNow(env.timeZone, new Date(completedAt))));
  if (rolled) {
    const series = db.transaction(() => {
      upsertTask(db, rolled.occurrence, 'create', occurrenceOwner(db, id));
      return upsertTask(db, rolled.series, 'update');
    })();
    return { task: series, applied: true };
  }

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

/** TickTick's "Skip": on to the next date, with no completed copy left behind. */
export function skipTask(db: Database.Database, id: string, viewer: Viewer = OWNER_VIEWER): Task {
  const current = getTask(db, id, viewer);
  if (current.deletedAt) throw new TaskServiceError('bad_request', 'Task is in the trash; restore it first');
  const skipped = skipRepeating(current, stampAfter(current.updatedAt), todayISO());
  if (!skipped) throw new TaskServiceError('bad_request', 'Only an open repeating task with another date to go can be skipped');
  return runWrite(db, skipped, 'update');
}

/** The completed copy belongs to whoever owns the series, as if it had always been there. */
function occurrenceOwner(db: Database.Database, seriesId: string): string | null {
  const row = db.prepare('SELECT owner_id FROM tasks WHERE id = ?').get(seriesId) as { owner_id: string | null } | undefined;
  return row?.owner_id ?? null;
}

/** The user's calendar date, in YARUKOTO_TZ rather than the container's zone. */
function todayISO(): string {
  return toISODate(wallClockNow(env.timeZone));
}

/**
 * A repeat as a caller may give it — an object, an RRULE, or a phrase — read
 * into the stored form. Anything unreadable is refused rather than dropped, so
 * a typo doesn't silently leave a task that never comes back.
 */
export function readRepeat(value: TaskRepeat | string): TaskRepeat {
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^(RRULE:)?FREQ=/i.test(text)) {
      const repeat = normalizeRepeat({ rule: text, from: 'due' });
      if (repeat) return repeat;
    } else {
      // "weekday" means the same as "every weekday".
      const given = text.split(/\s+/);
      const words = /^(every!?|daily|weekly|monthly|yearly|annually)$/i.test(given[0]) ? given : ['every'].concat(given);
      const phrase = parseRepeatPhrase(words);
      if (phrase && phrase.wordCount === words.length) return phrase.repeat;
    }
    throw new TaskServiceError('bad_request', `Can't read "${value}" as a repeat; try "every weekday", "every 2 weeks" or an RRULE`);
  }
  const repeat = normalizeRepeat(value);
  if (!repeat) throw new TaskServiceError('bad_request', 'repeat needs a rule (an RRULE such as FREQ=WEEKLY;BYDAY=MO) and from: due or completion');
  return repeat;
}

function runWrite(
  db: Database.Database,
  task: Task,
  op: 'create' | 'update' | 'delete' | 'restore',
  ownerId: string | null = null
): Task {
  return db.transaction(() => upsertTask(db, task, op, ownerId))();
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

function applyInput(db: Database.Database, task: Task, input: TaskInput, stamp: string, viewer: Viewer): Task {
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
      out.repeat = null;
    }
  }
  if (input.repeat !== undefined) {
    out.repeat = input.repeat === null ? null : readRepeat(input.repeat);
    // "every monday" on a task with no date starts on the first Monday.
    if (out.repeat && !out.dueDate) out.dueDate = firstOccurrenceOnOrAfter(out.repeat, todayISO());
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
    if (input.listId !== null && !listLists(db, viewer).some((l) => l.id === input.listId)) {
      throw new TaskServiceError('bad_request', `No list with id ${input.listId}`);
    }
    out.listId = input.listId;
  }
  if (input.assigneeId !== undefined) {
    if (input.assigneeId !== null && !db.prepare('SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL').get(input.assigneeId)) {
      throw new TaskServiceError('bad_request', `No household member with id ${input.assigneeId}`);
    }
    out.assigneeId = input.assigneeId;
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

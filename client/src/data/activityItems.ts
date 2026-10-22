import { ListDef, Subtask, Task } from './types';
import { markdownToPlainText } from './markdown';
import { diffNotes } from './notesDiff';
import { ActivityKind } from './activityFilter';
import { addDays, formatDueFull, formatDueShort, fromISODate, toISODate } from './dateUtils';
import type { ActivityRevision } from './api';

/**
 * Revisions turned into what the app shows of them: what kind of change each
 * was, and which fields it touched. Shared by the Activity tab and a task's own
 * history, so the two describe the same edit the same way.
 */

/**
 * One line of a change shown line by line: a line of notes added or removed, or
 * one subtask added, removed, checked off, unchecked or renamed.
 */
export type ChangeLine =
  | { kind: 'added' | 'removed' | 'checked' | 'unchecked'; text: string }
  | { kind: 'renamed'; before: string; text: string };

export interface ChangeDiff {
  lines: ChangeLine[];
  /** Changed lines beyond the ones returned. */
  hidden: number;
  /** What the hidden count counts; lines when not given. */
  unit?: string;
}

export interface ActivityChange {
  label: string;
  before: string;
  after: string;
  /** Changed lines, shown instead of before › after when there are any. */
  diff?: ChangeDiff;
  /** What to call the edit when this is the only field it touched. */
  title?: string;
  detail?: string;
}

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  changes?: ActivityChange[];
  taskId: string;
  taskTitle: string;
  recordedAt: string;
}

const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
export const timeLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function dayKey(value: string): string {
  return toISODate(new Date(value));
}

export function dayLabel(day: string): string {
  const now = new Date();
  if (day === toISODate(now)) return 'Today';
  if (day === toISODate(addDays(now, -1))) return 'Yesterday';
  return todayLabel.format(fromISODate(day));
}

function compactText(value: string, fallback = 'None'): string {
  return value.replace(/\s+/g, ' ').trim() || fallback;
}

function priorityLabel(value: Task['priority']): string {
  return value === 'none' ? 'None' : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function listLabel(lists: ListDef[], id: string | null): string {
  if (!id) return 'Inbox';
  return lists.find((list) => list.id === id)?.name ?? 'Unknown list';
}

function tagsLabel(tags: string[]): string {
  return tags.length ? tags.map((tag) => `#${tag}`).join(' ') : 'None';
}

/** Subtask lines shown before the rest are counted; a list is often added in one go. */
const SUBTASK_LINES = 4;

function counted(count: number, verb: string): string {
  return count === 1 ? `${verb} subtask` : `${verb} ${count} subtasks`;
}

/**
 * Subtasks matched by id, so each one that changed gets its own line instead of
 * the whole list being compared as one value. Null when nothing changed.
 */
export function subtasksChange(before: Subtask[], after: Subtask[]): ActivityChange | null {
  const previous = new Map(before.map((subtask) => [subtask.id, subtask]));
  const current = new Set(after.map((subtask) => subtask.id));
  const title = (subtask: Subtask) => compactText(subtask.title, 'Untitled');

  const added: ChangeLine[] = [];
  const renamed: ChangeLine[] = [];
  const checked: ChangeLine[] = [];
  const unchecked: ChangeLine[] = [];
  for (const subtask of after) {
    const old = previous.get(subtask.id);
    if (!old) {
      added.push({ kind: 'added', text: title(subtask) });
      continue;
    }
    if (title(old) !== title(subtask)) renamed.push({ kind: 'renamed', before: title(old), text: title(subtask) });
    if (!old.done && subtask.done) checked.push({ kind: 'checked', text: title(subtask) });
    if (old.done && !subtask.done) unchecked.push({ kind: 'unchecked', text: title(subtask) });
  }
  const removed: ChangeLine[] = before
    .filter((subtask) => !current.has(subtask.id))
    .map((subtask) => ({ kind: 'removed', text: title(subtask) }));

  const kept = (list: Subtask[]) => list.filter((subtask) => previous.has(subtask.id) && current.has(subtask.id)).map((subtask) => subtask.id);
  const reordered = kept(before).join('\n') !== kept(after).join('\n');

  const groups = [added, removed, renamed, checked, unchecked].filter((group) => group.length > 0);
  if (groups.length === 0 && !reordered) return null;

  const lines = groups.flat();
  const done = after.filter((subtask) => subtask.done).length;
  const progress = `${done} of ${after.length} done`;
  let headline = 'Edited subtasks';
  let detail: string | undefined;
  if (groups.length === 0) headline = 'Reordered subtasks';
  else if (groups.length === 1 && !reordered) {
    if (added.length) headline = counted(added.length, 'Added');
    else if (removed.length) headline = counted(removed.length, 'Removed');
    else if (renamed.length) headline = counted(renamed.length, 'Renamed');
    else if (checked.length) [headline, detail] = [counted(checked.length, 'Checked off'), progress];
    else [headline, detail] = [counted(unchecked.length, 'Unchecked'), progress];
  }

  return {
    label: 'Subtasks',
    before: `${before.length} ${before.length === 1 ? 'subtask' : 'subtasks'}`,
    after: groups.length === 0 ? 'Reordered' : `${after.length} ${after.length === 1 ? 'subtask' : 'subtasks'}`,
    diff: lines.length ? { lines: lines.slice(0, SUBTASK_LINES), hidden: Math.max(0, lines.length - SUBTASK_LINES), unit: 'subtask' } : undefined,
    title: headline,
    detail,
  };
}

export function changesFor(task: Task, previous: Task | null, lists: ListDef[]): ActivityChange[] {
  if (!previous) return [];
  const changes: ActivityChange[] = [];
  if (task.title !== previous.title) {
    changes.push({ label: 'Title', before: compactText(previous.title, 'Untitled'), after: compactText(task.title, 'Untitled') });
  }
  if (task.notes !== previous.notes) {
    changes.push({
      label: 'Notes',
      before: markdownToPlainText(previous.notes),
      after: markdownToPlainText(task.notes),
      diff: diffNotes(previous.notes, task.notes),
    });
  }
  if (task.priority !== previous.priority) {
    changes.push({ label: 'Priority', before: priorityLabel(previous.priority), after: priorityLabel(task.priority) });
  }
  if (task.dueDate !== previous.dueDate || task.dueTime !== previous.dueTime) {
    changes.push({
      label: 'Date',
      before: formatDueFull(previous.dueDate, previous.dueTime),
      after: formatDueFull(task.dueDate, task.dueTime),
    });
  }
  if (task.listId !== previous.listId) {
    changes.push({ label: 'List', before: listLabel(lists, previous.listId), after: listLabel(lists, task.listId) });
  }
  if (JSON.stringify(task.tags) !== JSON.stringify(previous.tags)) {
    changes.push({ label: 'Tags', before: tagsLabel(previous.tags), after: tagsLabel(task.tags) });
  }
  const subtasks = subtasksChange(previous.subtasks, task.subtasks);
  if (subtasks) changes.push(subtasks);
  if (task.order !== previous.order) {
    changes.push({
      label: 'Position',
      before: 'Previous',
      after: task.order < previous.order ? 'Moved earlier' : 'Moved later',
    });
  }
  return changes;
}

function editTitle(changes: ActivityChange[]): string {
  if (changes.length === 1) return changes[0].title ?? `Edited ${changes[0].label.toLowerCase()}`;
  return `Edited ${changes.length} fields`;
}

export function summarize(revision: ActivityRevision, now: Date, lists: ListDef[]): ActivityItem[] {
  const { task, previousTask, op } = revision;
  const taskTitle = task.title.trim() || previousTask?.title.trim() || 'Untitled task';
  const changes = changesFor(task, previousTask, lists);
  const due = formatDueShort(now, task.dueDate, task.dueTime);

  if (op === 'create') {
    const items: ActivityItem[] = [];
    // Older servers recorded only the final snapshot when a task was created
    // and changed again before its first sync. Expand those combined revisions
    // so existing history is useful too; newer servers emit separate rows.
    if (task.deletedAt) {
      items.push({ id: `${revision.id}-deleted`, kind: 'delete', title: 'Deleted task', taskId: task.id, taskTitle, recordedAt: revision.recordedAt });
    }
    if (task.completed) {
      items.push({ id: `${revision.id}-completed`, kind: 'complete', title: 'Completed task', taskId: task.id, taskTitle, recordedAt: revision.recordedAt });
    }
    items.push({
      id: String(revision.id),
      kind: 'create',
      title: 'Created task',
      taskId: task.id,
      taskTitle,
      detail: due ? `Due ${due}` : undefined,
      recordedAt: revision.recordedAt,
    });
    return items;
  }
  if (op === 'delete' || task.deletedAt) {
    return [{ id: String(revision.id), kind: 'delete', title: 'Deleted task', taskId: task.id, taskTitle, recordedAt: revision.recordedAt }];
  }
  if (op === 'restore') {
    return [{ id: String(revision.id), kind: 'restore', title: 'Restored task', taskId: task.id, taskTitle, recordedAt: revision.recordedAt }];
  }

  const items: ActivityItem[] = [];
  if (previousTask && !previousTask.completed && task.completed) {
    items.push({ id: `${revision.id}-completed`, kind: 'complete', title: 'Completed task', taskId: task.id, taskTitle, recordedAt: revision.recordedAt });
  }
  if (previousTask && previousTask.completed && !task.completed) {
    items.push({ id: `${revision.id}-reopened`, kind: 'reopen', title: 'Reopened task', taskId: task.id, taskTitle, recordedAt: revision.recordedAt });
  }

  if (changes.length > 0) {
    items.push({
      id: `${revision.id}-edited`,
      kind: 'edit',
      title: editTitle(changes),
      detail: changes.length === 1 ? changes[0].detail : undefined,
      taskId: task.id,
      taskTitle,
      changes,
      recordedAt: revision.recordedAt,
    });
  }
  if (items.length === 0) {
    items.push({ id: String(revision.id), kind: 'edit', title: 'Edited task', taskId: task.id, taskTitle, recordedAt: revision.recordedAt });
  }
  return items;
}

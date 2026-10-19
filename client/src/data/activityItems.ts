import { ListDef, Task } from './types';
import { markdownToPlainText } from './markdown';
import { NotesDiff, diffNotes } from './notesDiff';
import { ActivityKind } from './activityFilter';
import { addDays, formatDueFull, formatDueShort, fromISODate, toISODate } from './dateUtils';
import type { ActivityRevision } from './api';

/**
 * Revisions turned into what the app shows of them: what kind of change each
 * was, and which fields it touched. Shared by the Activity tab and a task's own
 * history, so the two describe the same edit the same way.
 */

export interface ActivityChange {
  label: string;
  before: string;
  after: string;
  /** Changed lines, shown instead of before › after when there are any. */
  diff?: NotesDiff;
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

function subtasksLabel(task: Task, previous?: Task): string {
  const done = task.subtasks.filter((subtask) => subtask.done).length;
  const previousDone = previous?.subtasks.filter((subtask) => subtask.done).length;
  if (previous && done !== previousDone) return `${done}/${task.subtasks.length} done`;
  if (task.subtasks.length === 0) return 'None';
  return task.subtasks.map((subtask) => compactText(subtask.title, 'Untitled')).join(', ');
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
  if (JSON.stringify(task.subtasks) !== JSON.stringify(previous.subtasks)) {
    changes.push({
      label: 'Subtasks',
      before: subtasksLabel(previous),
      after: subtasksLabel(task, previous),
    });
  }
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
  if (changes.length === 1) return `Edited ${changes[0].label.toLowerCase()}`;
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

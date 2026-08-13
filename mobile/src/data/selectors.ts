import { FolderDef, ListDef, Task } from './types';
import { fromISODate, isSameDay, startOfDay } from './dateUtils';

/**
 * Lists and folders are soft-deleted like tasks — the row stays so the deletion
 * reaches other devices instead of the container reappearing on the next pull.
 * Every view therefore has to exclude them, which is what these two are for:
 * enumerate through `activeLists`/`activeFolders` rather than raw state.
 */
export function activeLists(lists: ListDef[]): ListDef[] {
  return lists.filter((l) => !l.deletedAt);
}

export function activeFolders(folders: FolderDef[]): FolderDef[] {
  return folders.filter((f) => !f.deletedAt);
}

/**
 * Undefined for a deleted list as well as a missing one, so a task still
 * pointing at a list that another device deleted simply reads as Inbox rather
 * than rendering a ghost.
 */
export function getListById(lists: ListDef[], id: string | null): ListDef | undefined {
  if (!id) return undefined;
  return lists.find((l) => l.id === id && !l.deletedAt);
}

export function listsInFolder(lists: ListDef[], folderId: string): ListDef[] {
  return activeLists(lists).filter((l) => l.folderId === folderId);
}

/**
 * In the trash. Deleted rows are kept so they can be restored and so the deletion
 * can reach other devices, which means every view has to exclude them explicitly.
 */
export function isTrashed(task: Task): boolean {
  return !!task.deletedAt;
}

export function activeTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.completed && !isTrashed(t)).sort((a, b) => a.order - b.order);
}

export function completedTasksList(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.completed && !isTrashed(t)).sort((a, b) => a.order - b.order);
}

/** Newest deletion first — the order you'd want when hunting for something. */
export function trashedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter(isTrashed)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
}

/** Inbox is the untriaged pile: anything not yet filed into a list. */
export function isUnfiled(task: Task): boolean {
  return task.listId === null;
}

export function inboxTasks(tasks: Task[]): Task[] {
  return activeTasks(tasks).filter(isUnfiled);
}

export function completedInboxTasks(tasks: Task[]): Task[] {
  return completedTasksList(tasks).filter(isUnfiled);
}

/** Everything still needing a date — the default slice to plan from. */
export function unscheduledTasks(tasks: Task[]): Task[] {
  return activeTasks(tasks).filter((t) => !t.dueDate);
}

export function listCounts(tasks: Task[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) {
    if (t.completed || isTrashed(t) || !t.listId) continue;
    out[t.listId] = (out[t.listId] || 0) + 1;
  }
  return out;
}

export function tagCounts(tasks: Task[]): { tag: string; count: number }[] {
  const out: Record<string, number> = {};
  for (const t of tasks) {
    if (t.completed || isTrashed(t)) continue;
    for (const tag of t.tags) out[tag] = (out[tag] || 0) + 1;
  }
  return Object.entries(out)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function tasksForToday(tasks: Task[], now: Date): Task[] {
  return activeTasks(tasks).filter((t) => t.dueDate && isSameDay(fromISODate(t.dueDate), now));
}

export function tasksUpcomingCount(tasks: Task[], now: Date): number {
  const today = startOfDay(now).getTime();
  return tasks.filter(
    (t) => !t.completed && !isTrashed(t) && t.dueDate && startOfDay(fromISODate(t.dueDate)).getTime() > today
  ).length;
}

export function inboxCount(tasks: Task[]): number {
  return inboxTasks(tasks).length;
}

/** Groups active, dated tasks by ISO date for the calendar agenda + dots. */
export function tasksByDate(tasks: Task[], includeCompleted = false): Map<string, Task[]> {
  const out = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.dueDate || isTrashed(t) || (t.completed && !includeCompleted)) continue;
    const arr = out.get(t.dueDate) ?? [];
    arr.push(t);
    out.set(t.dueDate, arr);
  }
  for (const arr of out.values()) {
    // Time first, all-day last. All-day tasks all tie, so fall back to the same
    // manual `order` the list views sort by rather than leaving them in whatever
    // sequence the task array happened to be in.
    arr.sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') || a.order - b.order);
  }
  return out;
}

export function folderTotal(lists: ListDef[], counts: Record<string, number>, folderId: string): number {
  return listsInFolder(lists, folderId).reduce((sum, l) => sum + (counts[l.id] ?? 0), 0);
}

export function unusedFolders(folders: FolderDef[]): FolderDef[] {
  return activeFolders(folders);
}

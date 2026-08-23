import { FolderDef, ListDef, Task } from './types';
import { fromISODate, isSameDay, startOfDay } from './dateUtils';

/**
 * Lists and folders are soft-deleted like tasks — the row stays so the deletion
 * reaches other devices instead of the container reappearing on the next pull.
 * Every view therefore has to exclude them, which is what `activeLists` and
 * `activeFolders` below are for: enumerate through those rather than raw state.
 *
 * They also sort, which is the other half of their job. The arrays they're
 * handed come from the sync pull, which returns rows by `server_updated_at`, so
 * leaning on array order meant the nav re-sorted itself whenever you renamed
 * something and came back differently on every launch.
 */

/**
 * The tie-break is `id`, deliberately, not `name`: ids never change, so no edit
 * can move a row. Ties are reachable — two devices inserting at the same spot
 * while offline both land on the same midpoint — and `Array.sort` being stable
 * is no help, because "stable relative to the input array" is the exact
 * property being thrown away here.
 */
export function compareOrder<T extends { id: string; order: number }>(a: T, b: T): number {
  return a.order - b.order || a.id.localeCompare(b.id);
}

/**
 * Note the order is only meaningful *within a folder* — a list's `order`
 * restarts per folder, so a flat sort of every list interleaves them. Callers
 * wanting the whole tree in nav order want `orderedLists`.
 */
export function activeLists(lists: ListDef[]): ListDef[] {
  return lists.filter((l) => !l.deletedAt).sort(compareOrder);
}

export function activeFolders(folders: FolderDef[]): FolderDef[] {
  return folders.filter((f) => !f.deletedAt).sort(compareOrder);
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

/** `null` asks for the lists at the root, which sit among the folders. */
export function listsInFolder(lists: ListDef[], folderId: string | null): ListDef[] {
  return activeLists(lists).filter((l) => l.folderId === folderId);
}

/**
 * One row of the nav's root: a folder together with its lists, or a run of
 * lists that aren't in one.
 */
export interface NavGroup {
  /** null for the run of loose lists at the root. */
  folder: FolderDef | null;
  lists: ListDef[];
}

/**
 * The nav's shape, for every surface that renders folders and lists together.
 *
 * The root interleaves the two — a loose list can sit above one folder and
 * below another — so walking `activeFolders` alone silently drops every list
 * that isn't in a folder. Consecutive loose lists collapse into one
 * heading-less group, which is what makes this drop straight into the pickers
 * that already render a heading per folder.
 */
export function navGroups(lists: ListDef[], folders: FolderDef[]): NavGroup[] {
  const root = [
    ...activeFolders(folders).map((folder) => ({ folder, order: folder.order, id: folder.id })),
    ...listsInFolder(lists, null).map((list) => ({ list, order: list.order, id: list.id })),
  ].sort(compareOrder);

  const groups: NavGroup[] = [];
  for (const entry of root) {
    if ('folder' in entry) {
      groups.push({ folder: entry.folder, lists: listsInFolder(lists, entry.folder.id) });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.folder === null) last.lists.push(entry.list);
    else groups.push({ folder: null, lists: [entry.list] });
  }
  return groups;
}

/**
 * Every active list in the order the nav shows them, flattened.
 *
 * The nav's root interleaves folders with the lists that aren't in one, so this
 * walks that merged sequence and drops each folder's lists in behind it. For
 * the surfaces that want one flat sequence rather than the tree — a picker, an
 * autocomplete, the rank behind grouping by list.
 */
export function orderedLists(lists: ListDef[], folders: FolderDef[]): ListDef[] {
  return navGroups(lists, folders).flatMap((g) => g.lists);
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

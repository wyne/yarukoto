import { FolderDef, ListDef, Task } from './types';
import { fromISODate, isSameDay, startOfDay } from './dateUtils';

export function getListById(lists: ListDef[], id: string | null): ListDef | undefined {
  if (!id) return undefined;
  return lists.find((l) => l.id === id);
}

export function listsInFolder(lists: ListDef[], folderId: string): ListDef[] {
  return lists.filter((l) => l.folderId === folderId);
}

export function activeTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.completed).sort((a, b) => a.order - b.order);
}

export function completedTasksList(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.completed).sort((a, b) => a.order - b.order);
}

export function listCounts(tasks: Task[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) {
    if (t.completed || !t.listId) continue;
    out[t.listId] = (out[t.listId] || 0) + 1;
  }
  return out;
}

export function tagCounts(tasks: Task[]): { tag: string; count: number }[] {
  const out: Record<string, number> = {};
  for (const t of tasks) {
    if (t.completed) continue;
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
  return tasks.filter((t) => !t.completed && t.dueDate && startOfDay(fromISODate(t.dueDate)).getTime() > today).length;
}

export function inboxCount(tasks: Task[]): number {
  return activeTasks(tasks).length;
}

/** Groups active, dated tasks by ISO date for the calendar agenda + dots. */
export function tasksByDate(tasks: Task[]): Map<string, Task[]> {
  const out = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.completed || !t.dueDate) continue;
    const arr = out.get(t.dueDate) ?? [];
    arr.push(t);
    out.set(t.dueDate, arr);
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99'));
  }
  return out;
}

export function folderTotal(lists: ListDef[], counts: Record<string, number>, folderId: string): number {
  return listsInFolder(lists, folderId).reduce((sum, l) => sum + (counts[l.id] ?? 0), 0);
}

export function unusedFolders(folders: FolderDef[]): FolderDef[] {
  return folders;
}

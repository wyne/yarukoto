import { FolderDef, ListDef, Priority, Task } from './types';
import { fromISODate, startOfDay } from './dateUtils';

export type GroupBy = 'none' | 'list' | 'date' | 'tag' | 'priority';
export type SortBy = 'manual' | 'date' | 'title' | 'tag' | 'priority';

export interface ViewOptions {
  groupBy: GroupBy;
  sortBy: SortBy;
}

/** 'manual' keeps the existing drag order, so a view looks unchanged until the user picks something. */
export const DEFAULT_VIEW_OPTIONS: ViewOptions = { groupBy: 'none', sortBy: 'manual' };

export const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'list', label: 'List' },
  { value: 'date', label: 'Date' },
  { value: 'tag', label: 'Tag' },
  { value: 'priority', label: 'Priority' },
];

export const SORT_BY_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'manual', label: 'Custom' },
  { value: 'date', label: 'Date' },
  { value: 'title', label: 'Title' },
  { value: 'tag', label: 'Tag' },
  { value: 'priority', label: 'Priority' },
];

/** Stable per-view identity so each view remembers its own grouping and sort. */
export function viewKey(mode: string, filter?: { type: string; value: string }): string {
  return filter ? `${mode}:${filter.type}:${filter.value}` : mode;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2, none: 3 };
const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low', none: 'No priority' };

/** Sorts anything missing the sort key to the end. */
const LAST = '￿';

function dueKey(t: Task): string {
  return t.dueDate ? `${t.dueDate} ${t.dueTime ?? '99:99'}` : LAST;
}

function firstTag(t: Task): string {
  return t.tags.length ? [...t.tags].sort()[0].toLowerCase() : LAST;
}

function comparator(sortBy: SortBy): ((a: Task, b: Task) => number) | null {
  switch (sortBy) {
    case 'date':
      return (a, b) => dueKey(a).localeCompare(dueKey(b));
    case 'title':
      return (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    case 'tag':
      return (a, b) => firstTag(a).localeCompare(firstTag(b));
    case 'priority':
      return (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    default:
      return null;
  }
}

export function sortTasks(tasks: Task[], sortBy: SortBy): Task[] {
  const cmp = comparator(sortBy);
  const byOrder = (a: Task, b: Task) => a.order - b.order;
  return [...tasks].sort(cmp ? (a, b) => cmp(a, b) || byOrder(a, b) : byOrder);
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
  /** Swatch shown next to the header — list colours when grouping by list. */
  color?: string;
}

interface GroupContext {
  lists: ListDef[];
  folders: FolderDef[];
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateBucket(t: Task, now: Date): { key: string; label: string } {
  if (!t.dueDate) return { key: 'nodate', label: 'No date' };
  const diff = Math.round((startOfDay(fromISODate(t.dueDate)).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (diff < 0) return { key: 'overdue', label: 'Overdue' };
  if (diff === 0) return { key: 'today', label: 'Today' };
  if (diff === 1) return { key: 'tomorrow', label: 'Tomorrow' };
  if (diff <= 7) return { key: 'week', label: 'Next 7 days' };
  return { key: 'later', label: 'Later' };
}

const DATE_BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'week', 'later', 'nodate'];

/**
 * Splits tasks into display groups. Grouping by tag is the one case where a task can
 * appear more than once — a task tagged #dev #docs shows under both, same as TickTick.
 * Empty groups are dropped. `sortBy` orders tasks within each group.
 */
export function groupTasks(tasks: Task[], options: ViewOptions, ctx: GroupContext): TaskGroup[] {
  const { groupBy, sortBy } = options;

  if (groupBy === 'none') {
    return [{ key: 'all', label: '', tasks: sortTasks(tasks, sortBy) }];
  }

  const buckets = new Map<string, TaskGroup>();
  const push = (key: string, label: string, task: Task, color?: string) => {
    const g = buckets.get(key) ?? { key, label, tasks: [], color };
    g.tasks.push(task);
    buckets.set(key, g);
  };

  for (const t of tasks) {
    switch (groupBy) {
      case 'list': {
        const list = t.listId ? ctx.lists.find((l) => l.id === t.listId) : undefined;
        if (list) push(list.id, list.name, t, list.color);
        else push('__inbox', 'Inbox', t);
        break;
      }
      case 'date': {
        const b = dateBucket(t, ctx.now);
        push(b.key, b.label, t);
        break;
      }
      case 'tag': {
        if (t.tags.length === 0) push('__untagged', 'No tag', t);
        else for (const tag of t.tags) push(`tag:${tag}`, `#${tag}`, t);
        break;
      }
      case 'priority': {
        push(`p:${t.priority}`, PRIORITY_LABEL[t.priority], t);
        break;
      }
    }
  }

  const groups = [...buckets.values()];
  groups.forEach((g) => {
    g.tasks = sortTasks(g.tasks, sortBy);
  });

  switch (groupBy) {
    case 'list': {
      // Folder order, then list order within each folder, with Inbox last.
      const rank = new Map<string, number>();
      let i = 0;
      for (const folder of ctx.folders) {
        for (const l of ctx.lists.filter((x) => x.folderId === folder.id)) rank.set(l.id, i++);
      }
      return groups.sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity));
    }
    case 'date':
      return groups.sort((a, b) => DATE_BUCKET_ORDER.indexOf(a.key) - DATE_BUCKET_ORDER.indexOf(b.key));
    case 'tag':
      return groups.sort((a, b) => {
        if (a.key === '__untagged') return 1;
        if (b.key === '__untagged') return -1;
        return a.label.localeCompare(b.label);
      });
    case 'priority':
      return groups.sort(
        (a, b) =>
          PRIORITY_RANK[a.key.slice(2) as Priority] - PRIORITY_RANK[b.key.slice(2) as Priority]
      );
    default:
      return groups;
  }
}

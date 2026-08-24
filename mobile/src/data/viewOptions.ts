import { FolderDef, GroupBy, ListDef, Priority, SortBy, Task, ViewPref } from './types';
import { fromISODate, startOfDay } from './dateUtils';
import { orderedLists } from './selectors';

export type { GroupBy, SortBy };

export interface ViewOptions {
  groupBy: GroupBy;
  sortBy: SortBy;
  /** See `ViewPref.arrangements`. */
  arrangements: Arrangements;
}

/** `sortBy → group key → task id → position within that group.` */
export type Arrangements = Record<string, Record<string, Record<string, number>>>;

/** 'manual' keeps the existing drag order, so a view looks unchanged until the user picks something. */
export const DEFAULT_VIEW_OPTIONS: ViewOptions = { groupBy: 'none', sortBy: 'manual', arrangements: {} };

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

/**
 * Stable per-view identity so each view remembers its own grouping and sort.
 * It doubles as the id of the synced `ViewPref` record, so it has to stay stable
 * across launches and devices — never derive it from anything session-scoped.
 */
export function viewKey(mode: string, filter?: { type: string; value: string }): string {
  return filter ? `${mode}:${filter.type}:${filter.value}` : mode;
}

/** The saved options for a view, or the defaults when it has never been configured. */
export function viewOptionsFor(prefs: ViewPref[], key: string): ViewOptions {
  const pref = prefs.find((p) => p.id === key && !p.deletedAt);
  if (!pref) return DEFAULT_VIEW_OPTIONS;
  // A server predating the column omits the field entirely.
  return { groupBy: pref.groupBy, sortBy: pref.sortBy, arrangements: pref.arrangements ?? {} };
}

/** Human-readable name of the sort a view is arranged against, for the restore prompt. */
export function sortLabel(sortBy: SortBy): string {
  return SORT_BY_OPTIONS.find((o) => o.value === sortBy)?.label ?? sortBy;
}

/** The single group every ungrouped view uses, so it can be arranged like any other. */
export const UNGROUPED_KEY = 'all';

/** Positions the user dragged out for one group under one sort, if any. */
export function arrangementFor(
  arrangements: Arrangements,
  sortBy: SortBy,
  groupKey: string
): Record<string, number> | undefined {
  const group = arrangements[sortBy]?.[groupKey];
  return group && Object.keys(group).length > 0 ? group : undefined;
}

/** Whether this sort has any hand-made arrangement left in this view. */
export function hasArrangement(arrangements: Arrangements, sortBy: SortBy): boolean {
  const bySort = arrangements[sortBy];
  return !!bySort && Object.values(bySort).some((g) => Object.keys(g).length > 0);
}

/**
 * A dropped sequence as stored positions. The gap is arbitrary — since an
 * arrangement covers one group of one sort of one view, the whole sequence is
 * rewritten on every drag and never has to be subdivided.
 */
export function arrangementFrom(ids: string[]): Record<string, number> {
  return Object.fromEntries(ids.map((id, i) => [id, i * 1024]));
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

/**
 * Orders one group for display.
 *
 * A group the user has arranged by hand ignores the comparator, which would only
 * undo what they built. Tasks with no position yet — created since, or newly
 * matching the view — lead the group, matching where a new task already appears
 * under the Custom order.
 */
export function sortTasks(tasks: Task[], options: ViewOptions, groupKey = UNGROUPED_KEY): Task[] {
  const byOrder = (a: Task, b: Task) => a.order - b.order;
  const cmp = comparator(options.sortBy);
  const natural = cmp ? (a: Task, b: Task) => cmp(a, b) || byOrder(a, b) : byOrder;

  const arrangement = arrangementFor(options.arrangements, options.sortBy, groupKey);
  if (!arrangement) return [...tasks].sort(natural);

  return [...tasks].sort((a, b) => {
    const pa = arrangement[a.id];
    const pb = arrangement[b.id];
    if (pa === undefined && pb === undefined) return natural(a, b);
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;
    return pa - pb;
  });
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

/**
 * Which stretch of time a task's due date falls in.
 *
 * Exported because the Browse filter offers the same vocabulary it groups by —
 * "overdue", "today" and the rest should mean one thing in the app, and two
 * implementations of "is this overdue" would eventually disagree.
 */
export function dateBucket(t: Task, now: Date): { key: string; label: string } {
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
  const { groupBy } = options;

  if (groupBy === 'none') {
    return [{ key: UNGROUPED_KEY, label: '', tasks: sortTasks(tasks, options, UNGROUPED_KEY) }];
  }

  const buckets = new Map<string, TaskGroup>();
  const listsById = new Map(ctx.lists.map((list) => [list.id, list]));
  const push = (key: string, label: string, task: Task, color?: string) => {
    const g = buckets.get(key) ?? { key, label, tasks: [], color };
    g.tasks.push(task);
    buckets.set(key, g);
  };

  for (const t of tasks) {
    switch (groupBy) {
      case 'list': {
        const list = t.listId ? listsById.get(t.listId) : undefined;
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
    g.tasks = sortTasks(g.tasks, options, g.key);
  });

  switch (groupBy) {
    case 'list': {
      // Inbox first, then folder order and list order within each folder.
      //
      // Ranked through `orderedLists` rather than from the arrays' own order:
      // `ctx` carries raw state, which arrives from the sync pull sorted by
      // `server_updated_at`. Doing it here rather than asking callers to hand in
      // sorted arrays means a future caller cannot get this subtly wrong.
      const rank = new Map<string, number>();
      let i = 1;
      for (const list of orderedLists(ctx.lists, ctx.folders)) rank.set(list.id, i++);
      return groups.sort((a, b) => {
        const ar = a.key === '__inbox' ? 0 : (rank.get(a.key) ?? Infinity);
        const br = b.key === '__inbox' ? 0 : (rank.get(b.key) ?? Infinity);
        return ar - br;
      });
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

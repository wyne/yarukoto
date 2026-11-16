import { FolderDef, GroupBy, ListDef, Priority, SortBy, Task, ViewPref } from './types';
import { DueBucket, addDays, dueBucket, startOfDay, toISODate } from '@yarukoto/domain/dates';
import { orderedLists } from './selectors';
import { clearDateLabel } from './reminders';
import { fromISODate, monthDayLabel, weekdayShort } from './dateUtils';

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

/**
 * Where grouping by list puts the tasks that are in no list.
 *
 * Named rather than spelled out at each site because it is read outside this
 * file too: a row under this header is already under the name of its list, so
 * `groupHide` has to recognise the one group where that isn't true.
 */
export const INBOX_GROUP_KEY = '__inbox';

/** Where grouping by tag puts the tasks that have none. */
export const UNTAGGED_KEY = '__untagged';

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
  /** Shown under its own header even in an ungrouped view. */
  headed?: boolean;
}

/**
 * The folded group at the end of a list that holds repeating tasks not due for a
 * while. Unlike every other group it starts folded, so `useCollapsedSections`
 * stores it the other way round: listed means open.
 */
export const LATER_REPEATS_KEY = '__laterRepeats';

/** How far ahead a repeating task can be due and still sit among the rest. */
export const LATER_REPEAT_DAYS = 14;

/**
 * Sets aside repeating tasks due more than `LATER_REPEAT_DAYS` out. A yearly
 * task is in every list for the eleven months it can't be done; once it is this
 * far off it is a reminder that it exists, not something to act on, so it waits
 * folded at the bottom until it comes close. One-off tasks stay put: someone
 * dated them on purpose, and there is only ever one of each.
 */
export function splitLaterRepeats(tasks: Task[], now: Date): { soon: Task[]; later: Task[] } {
  const cutoff = toISODate(addDays(startOfDay(now), LATER_REPEAT_DAYS));
  const soon: Task[] = [];
  const later: Task[] = [];
  for (const t of tasks) {
    if (t.repeat && t.dueDate && t.dueDate > cutoff) later.push(t);
    else soon.push(t);
  }
  later.sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
  return { soon, later };
}

/** The group `splitLaterRepeats` set aside, or nothing when it is empty. */
export function laterRepeatsGroup(later: Task[]): TaskGroup[] {
  return later.length > 0 ? [{ key: LATER_REPEATS_KEY, label: 'Upcoming repeats', tasks: later, headed: true }] : [];
}

interface GroupContext {
  lists: ListDef[];
  folders: FolderDef[];
  now: Date;
}

/**
 * Which stretch of time a task's due date falls in.
 *
 * Exported because the Browse filter offers the same vocabulary it groups by —
 * "overdue", "today" and the rest should mean one thing in the app, and two
 * implementations of "is this overdue" would eventually disagree.
 */
export function dateBucket(t: Task, now: Date): { key: string; label: string } {
  const key = dueBucket(t.dueDate, now);
  return { key, label: DATE_BUCKET_LABELS[key] };
}

const DATE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'Next 7 days',
  later: 'Later',
  nodate: 'No date',
};

const DATE_BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'week', 'later', 'nodate'];

/**
 * Splits tasks into display groups. Grouping by tag is the one case where a task can
 * appear more than once — a task tagged #dev #docs shows under both.
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
        else push(INBOX_GROUP_KEY, 'Inbox', t);
        break;
      }
      case 'date': {
        const b = dateBucket(t, ctx.now);
        push(b.key, b.label, t);
        break;
      }
      case 'tag': {
        if (t.tags.length === 0) push(UNTAGGED_KEY, 'No tag', t);
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
        const ar = a.key === INBOX_GROUP_KEY ? 0 : (rank.get(a.key) ?? Infinity);
        const br = b.key === INBOX_GROUP_KEY ? 0 : (rank.get(b.key) ?? Infinity);
        return ar - br;
      });
    }
    case 'date':
      return groups.sort((a, b) => DATE_BUCKET_ORDER.indexOf(a.key) - DATE_BUCKET_ORDER.indexOf(b.key));
    case 'tag':
      return groups.sort((a, b) => {
        if (a.key === UNTAGGED_KEY) return 1;
        if (b.key === UNTAGGED_KEY) return -1;
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

/**
 * Today over several days: one group per day, in order, each one there even
 * when nothing is due on it, so a free tomorrow reads as free rather than as
 * missing. Overdue tasks join today's group, as they do in a one-day Today.
 *
 * Today's group takes the ungrouped key, so an order dragged out in a one-day
 * Today carries over to it. Later days are keyed by how far ahead they are
 * rather than by date: the keys stay a handful however long the view is used,
 * and a day folded shut stays folded as the days move along.
 */
export function groupByDay(tasks: Task[], options: ViewOptions, now: Date, days: number): TaskGroup[] {
  const start = startOfDay(now);
  const groups: TaskGroup[] = Array.from({ length: days }, (_, offset) => {
    const date = addDays(start, offset);
    return {
      key: dayGroupKey(offset),
      label:
        offset === 0
          ? 'Today'
          : offset === 1
          ? 'Tomorrow'
          : `${weekdayShort(date)} ${monthDayLabel(date, now)}`,
      tasks: [],
    };
  });
  const startIso = toISODate(start);
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const offset =
      t.dueDate <= startIso
        ? 0
        : Math.round((fromISODate(t.dueDate).getTime() - start.getTime()) / 86400000);
    groups[offset]?.tasks.push(t);
  }
  groups.forEach((g) => {
    g.tasks = sortTasks(g.tasks, options, g.key);
  });
  return groups;
}

export function dayGroupKey(offset: number): string {
  return offset === 0 ? UNGROUPED_KEY : `day:${offset}`;
}

/** What a view's groups stand for: a `GroupBy`, or the days of a several-day Today. */
export type GroupDimension = GroupBy | 'day';

/**
 * The change a task takes on when it is dragged out of group `from` and dropped
 * into group `to`, or null when `to` can't take it.
 *
 * A group is a value of the field the view is grouped by, so landing in one sets
 * that field: a list moves the task, a priority sets it, a day dates it. Only
 * groups that stand for one exact value accept a drop. "Overdue", "Next 7 days"
 * and "Later" are stretches of time, and picking a day inside one for the user
 * would be a guess. Upcoming repeats is held out by how far off a repeat is, which
 * a drop can't sensibly change, so it neither gives nor takes.
 *
 * No date doesn't take a task that repeats or has reminders: both hang off the
 * date, so clearing it clears them too, and a drop gives no sign of that. Those
 * go through the task's own Clear date button, which names what goes with it.
 *
 * Grouping by tag swaps the tag of the group the task left for the one it landed
 * in, leaving its other tags alone — the row was under #dev, so #dev is the tag
 * being moved. No tag on either end removes or adds just that one.
 */
export function groupDropPatch(
  task: Task,
  from: string,
  to: string,
  dimension: GroupDimension,
  now: Date
): Partial<Task> | null {
  if (from === to || from === LATER_REPEATS_KEY || to === LATER_REPEATS_KEY) return null;
  switch (dimension) {
    case 'list':
      return { listId: to === INBOX_GROUP_KEY ? null : to };
    case 'priority': {
      const priority = to.slice(2) as Priority;
      return to.startsWith('p:') && priority in PRIORITY_RANK ? { priority } : null;
    }
    case 'date': {
      const offset = DATE_DROP_OFFSET[to];
      if (offset === undefined) return null;
      if (offset === null && clearDateLabel(task) !== undefined) return null;
      return offset === null
        ? { dueDate: undefined, dueTime: undefined }
        : { dueDate: toISODate(addDays(startOfDay(now), offset)) };
    }
    case 'day': {
      const offset = to === UNGROUPED_KEY ? 0 : to.startsWith('day:') ? Number(to.slice(4)) : NaN;
      return Number.isInteger(offset) && offset >= 0 ? { dueDate: toISODate(addDays(startOfDay(now), offset)) } : null;
    }
    case 'tag': {
      const leaving = from.startsWith('tag:') ? from.slice(4) : null;
      const joining = to.startsWith('tag:') ? to.slice(4) : null;
      if (leaving === null && from !== UNTAGGED_KEY) return null;
      if (joining === null && to !== UNTAGGED_KEY) return null;
      const tags = task.tags.filter((tag) => tag !== leaving);
      if (joining !== null && !tags.includes(joining)) tags.push(joining);
      return { tags };
    }
    default:
      return null;
  }
}

/** Days from today each date group stands for; null clears the date. Ranges are absent. */
const DATE_DROP_OFFSET: Partial<Record<string, number | null>> = { today: 0, tomorrow: 1, nodate: null };

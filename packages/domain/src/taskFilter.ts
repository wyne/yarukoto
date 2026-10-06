import { ListDef, Task } from './types';
import { dueBucket } from './dates';

/**
 * Narrowing a set of tasks down to the ones you asked for.
 *
 * Separate from the app's `selectors.ts`, which answers fixed questions — the
 * inbox, today, what is in the trash. These answer whatever question the user
 * has typed, so they take criteria rather than being one apiece.
 *
 * In the domain package because a saved filter is evaluated in two places: the app, and
 * the server's `/api/v1/filters/:id/tasks` for callers like Home Assistant. The
 * same criteria must admit the same tasks on both sides.
 */

/**
 * A predicate matching tasks against a search query.
 *
 * Built once per query rather than taking the query per task: trimming and
 * lowercasing are done on the way in, which would otherwise repeat for every
 * task in the list.
 *
 * Title and tags, which is what the search field has always looked at. Notes
 * stay out on purpose — a result whose match you cannot see from the row reads
 * as a bug rather than a hit.
 *
 * An empty query matches everything, so callers can apply it unconditionally.
 */
export function taskMatcher(query: string): (task: Task) => boolean {
  const q = query.trim().toLowerCase();
  if (!q) return () => true;
  return (task) =>
    task.title.toLowerCase().includes(q) || task.tags.some((tag) => tag.toLowerCase().includes(q));
}

/**
 * Fewer choices than `groupBy: 'date'` has buckets. Grouping wants every stretch
 * named separately; filtering wants the question you actually ask, and nobody
 * asks for "tomorrow but not today" — so `week` covers the next seven days from
 * now, tomorrow included.
 *
 * There is no `any`: several of these are held at once and an empty selection is
 * already what "any" means, the same way it does for lists and tags. A vocabulary
 * with a member meaning "ignore the other members" would let the two disagree.
 */
export type DueFilter = 'overdue' | 'today' | 'week' | 'later' | 'nodate';

/** Trash is never in scope here, so there is no filter for it. */
export type StatusFilter = 'active' | 'completed' | 'any';

/**
 * The same vocabularies as runtime values, for validating what comes back off
 * the device. A stored criteria set is only as trustworthy as the build that
 * wrote it — an older one, or a hand-edited store, can name a filter this
 * version has never heard of.
 */
export const DUE_FILTERS: DueFilter[] = ['overdue', 'today', 'week', 'later', 'nodate'];
export const STATUS_FILTERS: StatusFilter[] = ['active', 'completed', 'any'];

/**
 * Inbox is a real choice in the list filter, but its tasks have `listId: null`
 * and null cannot be a member of a list of ids. This stands in for it, and is
 * the same spelling `groupTasks` uses for the Inbox group.
 */
export const INBOX_LIST_ID = '__inbox';

/**
 * A question asked of the task set.
 *
 * Deliberately *not* an extension of `TaskListFilter`. That one is single-valued
 * and load-bearing well beyond filtering — `viewKey()` builds the synced
 * `ViewPref` record id out of it, so widening it would reach into state shared
 * across devices. This is a parallel type that nothing else reads.
 *
 * Empty means unrestricted, in every dimension.
 */
export interface TaskCriteria {
  query: string;
  listIds: string[];
  /** Expanded to the lists inside them when matching, not stored expanded. */
  folderIds: string[];
  tags: string[];
  /** Several stretches at once — "no date or overdue" is the planning question. */
  due: DueFilter[];
  status: StatusFilter;
}

export const EMPTY_CRITERIA: TaskCriteria = {
  query: '',
  listIds: [],
  folderIds: [],
  tags: [],
  due: [],
  status: 'active',
};

/** Whether the criteria narrow anything at all — what the Clear control reads. */
export function isEmptyCriteria(c: TaskCriteria): boolean {
  return (
    !c.query.trim() &&
    c.listIds.length === 0 &&
    c.folderIds.length === 0 &&
    c.tags.length === 0 &&
    c.due.length === 0 &&
    c.status === EMPTY_CRITERIA.status
  );
}

/**
 * The lists a task may be in, or null for "any".
 *
 * Folders contribute their lists. Ids naming a list that no longer exists are
 * dropped rather than matched against, and a selection consisting only of those
 * comes back as null — a deleted list must not leave the screen empty with
 * nothing on it to explain why. Inbox is exempt: it is a place, not a record,
 * so it cannot go missing.
 */
function resolveListIds(c: TaskCriteria, lists: ListDef[]): Set<string> | null {
  if (c.listIds.length === 0 && c.folderIds.length === 0) return null;
  const live = new Set(lists.filter((l) => !l.deletedAt).map((l) => l.id));
  const out = new Set<string>();
  for (const id of c.listIds) {
    if (id === INBOX_LIST_ID || live.has(id)) out.add(id);
  }
  for (const folderId of c.folderIds) {
    for (const list of lists) {
      if (!list.deletedAt && list.folderId === folderId) out.add(list.id);
    }
  }
  return out.size > 0 ? out : null;
}

function matchesDue(task: Task, due: DueFilter[], now: Date): boolean {
  if (due.length === 0) return true;
  const bucket = dueBucket(task.dueDate, now);
  // OR-ed, like every other multi-valued dimension. The stretches overlap —
  // `week` contains `today` — which costs nothing when the answer is a union.
  return due.some((d) =>
    d === 'week'
      ? bucket === 'today' || bucket === 'tomorrow' || bucket === 'week'
      : bucket === d
  );
}

/**
 * Every task the criteria admit, in the same order the rest of the app lists
 * tasks in.
 *
 * Dimensions are AND-ed and choices within one are OR-ed: two tags mean either
 * tag, but a tag and a list mean both. Trashed tasks are never included — the
 * Trash tab is the only place those belong.
 */
export function filterTasks(
  tasks: Task[],
  criteria: TaskCriteria,
  ctx: { lists: ListDef[]; now: Date }
): Task[] {
  const matchesText = taskMatcher(criteria.query);
  const listIds = resolveListIds(criteria, ctx.lists);
  const tags = criteria.tags.length > 0 ? new Set(criteria.tags) : null;

  return tasks
    .filter((t) => {
      if (t.deletedAt) return false;
      if (criteria.status === 'active' && t.completed) return false;
      if (criteria.status === 'completed' && !t.completed) return false;
      if (listIds && !listIds.has(t.listId ?? INBOX_LIST_ID)) return false;
      if (tags && !t.tags.some((tag) => tags.has(tag))) return false;
      if (!matchesDue(t, criteria.due, ctx.now)) return false;
      return matchesText(t);
    })
    .sort((a, b) => a.order - b.order);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Criteria from a source this build did not write — the device store, a synced
 * saved filter, a hand-rolled request.
 *
 * Validated a field at a time: a value this build has never heard of falls back
 * on its own without taking the rest of the criteria with it. Ids are not
 * checked, because whether a list still exists is a question for whoever has
 * the lists, and `filterTasks` already ignores ones that don't.
 */
export function normalizeCriteria(value: unknown): TaskCriteria {
  if (!value || typeof value !== 'object') return EMPTY_CRITERIA;
  const stored = value as Partial<Record<keyof TaskCriteria, unknown>>;
  return {
    query: typeof stored.query === 'string' ? stored.query : EMPTY_CRITERIA.query,
    listIds: stringArray(stored.listIds),
    folderIds: stringArray(stored.folderIds),
    tags: stringArray(stored.tags),
    // Filtered rather than rejected wholesale, so a build that knew a stretch
    // this one doesn't still keeps the stretches they have in common. A bare
    // string is what builds before this filter went multi-valued wrote; `any`
    // was one of those values and is spelled as no selection now, so it falls
    // out of `DUE_FILTERS` here without needing a case of its own.
    due: (Array.isArray(stored.due) ? stored.due : [stored.due]).filter((d): d is DueFilter =>
      DUE_FILTERS.includes(d as DueFilter)
    ),
    status: STATUS_FILTERS.includes(stored.status as StatusFilter)
      ? (stored.status as StatusFilter)
      : EMPTY_CRITERIA.status,
  };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

/**
 * Whether two criteria ask the same question — what tells Browse that the chips
 * currently set are a saved filter. Order within a dimension is ignored, since
 * picking two tags the other way round is the same filter; surrounding space in
 * the query is too, for the same reason `taskMatcher` trims it.
 */
export function sameCriteria(a: TaskCriteria, b: TaskCriteria): boolean {
  return (
    a.query.trim() === b.query.trim() &&
    a.status === b.status &&
    sameSet(a.listIds, b.listIds) &&
    sameSet(a.folderIds, b.folderIds) &&
    sameSet(a.tags, b.tags) &&
    sameSet(a.due, b.due)
  );
}

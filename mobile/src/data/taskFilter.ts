import { ListDef, Task } from './types';
import { isTrashed, listsInFolder } from './selectors';
import { dateBucket } from './viewOptions';

/**
 * Narrowing a set of tasks down to the ones you asked for.
 *
 * Separate from `selectors.ts`, which answers fixed questions — the inbox, today,
 * what is in the trash. These answer whatever question the user has just typed,
 * so they take criteria rather than being one apiece.
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
    for (const list of listsInFolder(lists, folderId)) out.add(list.id);
  }
  return out.size > 0 ? out : null;
}

function matchesDue(task: Task, due: DueFilter[], now: Date): boolean {
  if (due.length === 0) return true;
  const bucket = dateBucket(task, now).key;
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
      if (isTrashed(t)) return false;
      if (criteria.status === 'active' && t.completed) return false;
      if (criteria.status === 'completed' && !t.completed) return false;
      if (listIds && !listIds.has(t.listId ?? INBOX_LIST_ID)) return false;
      if (tags && !t.tags.some((tag) => tags.has(tag))) return false;
      if (!matchesDue(t, criteria.due, ctx.now)) return false;
      return matchesText(t);
    })
    .sort((a, b) => a.order - b.order);
}

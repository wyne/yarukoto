export type Priority = 'none' | 'low' | 'medium' | 'high';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** Fields every synced record carries, so last-write-wins has something to compare. */
export interface Synced {
  /** ISO timestamp of the last change. Stamped centrally by the reducer. */
  updatedAt: string;
  /** Set = in the trash. Rows are kept so they can be restored. */
  deletedAt?: string;
}

export interface Task extends Synced {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  /** ISO date, e.g. '2026-08-07'. Undefined = no due date. */
  dueDate?: string;
  /** 24h 'HH:mm'. Undefined = all-day. */
  dueTime?: string;
  /** null = Inbox (unfiled). */
  listId: string | null;
  tags: string[];
  subtasks: Subtask[];
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  order: number;
}

export interface ListDef extends Synced {
  id: string;
  name: string;
  color: string;
  /** null = at the root of the nav, alongside the folders rather than inside one. */
  folderId: string | null;
  /**
   * Position among this list's siblings — the other lists in its folder, or, for
   * a root list, the folders and other root lists it sits between.
   *
   * That second case is why a root list's `order` and a folder's are values in
   * one shared space: the nav interleaves them, so they have to be comparable.
   *
   * Scoping to the parent is what lets a move between folders write exactly one
   * record — `folderId` and `order` change together and no sibling shifts.
   * Fractional like `Task.order`, for the same reason.
   */
  order: number;
}

export interface FolderDef extends Synced {
  id: string;
  name: string;
  /** Position among the root's rows, which it shares with the root's lists. */
  order: number;
}

export type GroupBy = 'none' | 'list' | 'date' | 'tag' | 'priority';
export type SortBy = 'manual' | 'date' | 'title' | 'tag' | 'priority';

export const GROUP_BY_VALUES: GroupBy[] = ['none', 'list', 'date', 'tag', 'priority'];
export const SORT_BY_VALUES: SortBy[] = ['manual', 'date', 'title', 'tag', 'priority'];

/**
 * Grouping + sort saved for one view, so each list remembers its own arrangement.
 * `id` is the view key — 'today', 'inbox:list:l_home', 'inbox:tag:dev' — which
 * makes a view's preferences an ordinary synced record like any other.
 */
export interface ViewPref extends Synced {
  id: string;
  groupBy: GroupBy;
  sortBy: SortBy;
  /**
   * Arrangements the user has dragged out by hand, keyed `sortBy → group → task id`
   * and holding each task's position within that group.
   *
   * Scoping them this narrowly is what keeps a drag under a sort from disturbing
   * anything else: the task's own `order` — which *is* the Custom arrangement — is
   * never touched, and a drop never rewrites the field being sorted on, so a
   * reorder can't quietly change a priority or a due date. A group with no entry
   * here is sorted by the comparator, exactly as before.
   */
  arrangements?: Record<string, Record<string, Record<string, number>>>;
}

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
  folderId: string;
}

export interface FolderDef extends Synced {
  id: string;
  name: string;
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
}

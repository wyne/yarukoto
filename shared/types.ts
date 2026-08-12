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

export type Priority = 'none' | 'low' | 'medium' | 'high';

export type ReminderOption = 'none' | 'at_time' | '30m' | '1h' | '1d';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  /** ISO date, e.g. '2026-08-07'. Undefined = no due date. */
  dueDate?: string;
  /** 24h 'HH:mm'. Undefined = all-day. */
  dueTime?: string;
  reminder: ReminderOption;
  /** null = Inbox (unfiled). */
  listId: string | null;
  tags: string[];
  subtasks: Subtask[];
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  order: number;
}

export interface ListDef {
  id: string;
  name: string;
  color: string;
  folderId: string;
}

export interface FolderDef {
  id: string;
  name: string;
}

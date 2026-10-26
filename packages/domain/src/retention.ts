import type { Task } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a deleted row stays restorable when the server doesn't say. The server's
 * own `TRASH_RETENTION_DAYS` defaults to this, and `/api/v1/health` reports the
 * value it actually runs with.
 */
export const DEFAULT_TRASH_RETENTION_DAYS = 30;

/** How long a completed task stays in its list before it moves to the Archive. */
export const ARCHIVE_AFTER_DAYS = 30;

/**
 * The `deletedAt` before which a trashed row is gone for good. Compared as ISO
 * strings, which order the same way the instants do.
 */
export function trashCutoff(now: Date, retentionDays: number): string {
  return new Date(now.getTime() - retentionDays * DAY_MS).toISOString();
}

/** Whole days until a trashed row expires, never below zero. */
export function trashDaysLeft(deletedAt: string, now: Date, retentionDays: number): number {
  const expires = Date.parse(deletedAt) + retentionDays * DAY_MS;
  return Math.max(0, Math.ceil((expires - now.getTime()) / DAY_MS));
}

/**
 * When a completed task was finished. A row completed before `completedAt` was
 * recorded falls back to its last edit, so old completions still age out.
 */
export function completedOn(task: Task): string | undefined {
  if (!task.completed) return undefined;
  return task.completedAt ?? task.updatedAt;
}

/**
 * Completed long enough ago that it no longer belongs in its list.
 *
 * Derived rather than stored: the archive is a rule over when a task was finished,
 * so there is nothing to sync and nothing for an older server to drop. Reopening
 * a task clears `completedAt`, which brings it straight back.
 */
export function isArchived(task: Task, now: Date): boolean {
  const at = completedOn(task);
  if (!at) return false;
  return Date.parse(at) < now.getTime() - ARCHIVE_AFTER_DAYS * DAY_MS;
}

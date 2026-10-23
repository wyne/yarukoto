import { useSyncExternalStore } from 'react';
import { UNDO_TIMEOUT_MS } from '../data/TaskContext';

/**
 * "Added to Groceries", with a View beside it, when a task is added from a
 * view it doesn't show in: typed with a list, a date or a tag that puts it
 * somewhere else. The list can't go to the new row, so this says where it went
 * and offers to follow it. Shown where the undo notice shows, for as long.
 */

export interface AddedNotice {
  taskId: string;
  /** The view the task is shown in on View, by name. */
  where: string;
  /** Changes on every showing, so a repeat restarts the clock and the fade. */
  token: number;
}

let current: AddedNotice | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let next = 0;
const subscribers = new Set<() => void>();

function set(notice: AddedNotice | null) {
  current = notice;
  subscribers.forEach((notify) => notify());
}

export function showAddedNotice(taskId: string, where: string) {
  if (timer) clearTimeout(timer);
  set({ taskId, where, token: ++next });
  timer = setTimeout(() => {
    timer = null;
    set(null);
  }, UNDO_TIMEOUT_MS);
}

export function dismissAddedNotice() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (current) set(null);
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

export function useAddedNotice(): AddedNotice | null {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

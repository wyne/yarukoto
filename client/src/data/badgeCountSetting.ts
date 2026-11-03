import { useSyncExternalStore } from 'react';
import { BadgeCount } from './badgeCount';
import { loadBadgeCount, saveBadgeCount } from './storage';

/**
 * The Badge count setting as everything that shows the number reads it: the app
 * icon's badge, the menu bar extra and the Windows taskbar button.
 *
 * Read lazily, since storage is primed after this module loads.
 */
let current: BadgeCount | null = null;
const subscribers = new Set<() => void>();

function get(): BadgeCount {
  if (current === null) current = loadBadgeCount();
  return current;
}

export function setBadgeCount(next: BadgeCount): void {
  if (next === get()) return;
  current = next;
  saveBadgeCount(next);
  subscribers.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

export function useBadgeCount(): BadgeCount {
  return useSyncExternalStore(subscribe, get, get);
}

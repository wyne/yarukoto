import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTasks } from './TaskContext';
import { overdueCount } from './selectors';
import { addDays, startOfDay, toISODate } from './dateUtils';

/** Web's Badging API, which only installed web apps get. Not in TypeScript's DOM lib yet. */
type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function setBadge(count: number): void {
  if (Platform.OS === 'web') {
    const nav = typeof navigator === 'undefined' ? undefined : (navigator as BadgingNavigator);
    const pending = count > 0 ? nav?.setAppBadge?.(count) : nav?.clearAppBadge?.();
    pending?.catch(() => {});
    return;
  }
  Notifications.setBadgeCountAsync(count).catch((err) => {
    if (__DEV__) console.warn('Setting the app badge failed', err);
  });
}

/**
 * Keeps the app icon's badge at the number of overdue tasks.
 *
 * Overdue is day-level (see `isOverdue`), so the count changes when a task does
 * or when the date does. The date is tracked as state, moved on by a timer at
 * midnight and by coming back to the foreground — the timer doesn't run while
 * the app is suspended, so a phone left overnight is caught up on return.
 *
 * Only while the app runs: a badge set here stays as it was until the next
 * launch, including across the midnight that makes more tasks overdue.
 */
export default function AppBadge() {
  const { state } = useTasks();
  const [today, setToday] = useState(() => toISODate(new Date()));

  useEffect(() => {
    const now = new Date();
    const timer = setTimeout(
      () => setToday(toISODate(new Date())),
      startOfDay(addDays(now, 1)).getTime() - now.getTime() + 1000
    );
    return () => clearTimeout(timer);
  }, [today]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setToday(toISODate(new Date()));
    });
    return () => subscription.remove();
  }, []);

  // Sample data is a demo, and its overdue tasks aren't the user's.
  const count = useMemo(
    () => (state.mode === 'server' ? overdueCount(state.tasks, new Date()) : 0),
    // `today` is read through `new Date()`; it's here to recount when the date moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.mode, state.tasks, today]
  );

  useEffect(() => {
    setBadge(count);
  }, [count]);

  return null;
}

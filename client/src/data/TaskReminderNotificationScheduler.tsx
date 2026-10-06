import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTasks } from './TaskContext';
import { drainNativePendingActions } from '../../modules/notification-actions/src/NotificationActionsModule';
import {
  COMPLETE_ACTION_ID,
  PendingNotificationAction,
  SNOOZE_ACTION_ID,
  SNOOZE_DURATION_MS,
  SnoozedReminder,
  drainStoredPendingActions,
  parsePendingNotificationAction,
  pruneSnoozes,
  withSnooze,
} from './notificationActions';
import { loadSnoozes, saveSnoozes } from './storage';
import {
  TaskReminderNotificationRequest,
  buildTaskReminderNotificationRequests,
  parseTaskReminderNotificationData,
  reconcileTaskReminderNotifications,
} from './taskReminderNotifications';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function TaskReminderNotificationScheduler() {
  const { state, completeAt } = useTasks();
  const [snoozes, setSnoozes] = useState<SnoozedReminder[]>(() => pruneSnoozes(loadSnoozes()));

  const desired = useMemo(
    () => (state.mode === 'none' ? [] : buildTaskReminderNotificationRequests(state.tasks, snoozes)),
    [state.mode, state.tasks, snoozes]
  );
  const desiredRef = useRef<TaskReminderNotificationRequest[]>(desired);
  const reconcileRef = useRef(Promise.resolve());

  useEffect(() => {
    desiredRef.current = desired;
  }, [desired]);

  /**
   * Folds in every action taken while JS was not running — iOS's native queue
   * and Android's headless one, which hold the same entries for the same reason.
   *
   * Runs before each reconcile rather than beside it. Both are ultimately
   * self-correcting, since a snooze reaches storage before the app is told about
   * it, but reconciling first would cancel a snooze it has not yet heard of and
   * then reschedule it a render later — churn worth not creating.
   */
  const drainPendingActions = useCallback(async () => {
    const entries: PendingNotificationAction[] = [
      ...drainNativePendingActions()
        .map(parsePendingNotificationAction)
        .filter((entry): entry is PendingNotificationAction => entry !== null),
      ...(await drainStoredPendingActions()),
    ];

    // Read from storage rather than from a closure: the cache is synchronous and
    // authoritative, and this runs on a promise chain that may be several
    // renders behind whatever `snoozes` held when it was queued.
    const initial = loadSnoozes();
    let next = initial;
    for (const entry of entries) {
      if (entry.action === COMPLETE_ACTION_ID) {
        completeAt(entry.taskId, entry.at);
      } else if (entry.action === SNOOZE_ACTION_ID && entry.fireAt) {
        next = withSnooze(next, {
          taskId: entry.taskId,
          reminderId: entry.reminderId,
          fireAt: entry.fireAt,
        });
      }
    }

    // A snooze that has already fired is spent. Pruning here, on every reconcile,
    // is what keeps the list from growing for the life of the install.
    const pruned = pruneSnoozes(next);
    // Only when the list really moved. Completions are the common case and touch
    // no snooze, and setting state to an equal-but-new array would re-render,
    // rebuild `desired`, and reconcile a second time for nothing.
    if (next === initial && pruned.length === initial.length) return;
    // Persisted before the state update lands, so a snooze survives even if the
    // app is killed between drain and render.
    saveSnoozes(pruned);
    setSnoozes(pruned);
  }, [completeAt]);

  const requestReconcile = useCallback(() => {
    if (Platform.OS === 'web') return;
    reconcileRef.current = reconcileRef.current
      .catch(() => {})
      .then(() => drainPendingActions())
      // Read at the end of the chain, not captured at the start: a drain that
      // adds a snooze re-renders, and this picks up the request it produced.
      .then(() => reconcileTaskReminderNotifications(desiredRef.current))
      .catch((err) => {
        if (__DEV__) console.warn('Task reminder notification sync failed', err);
      });
  }, [drainPendingActions]);

  useEffect(() => {
    requestReconcile();
  }, [desired, requestReconcile]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') requestReconcile();
    });
    return () => subscription.remove();
  }, [requestReconcile]);

  /**
   * The same two buttons, tapped while the app is already running.
   *
   * Neither background path covers this. iOS's native handler does fire here —
   * it is registered for the life of the process — but nothing would then
   * prompt a drain, so the tap would sit in the queue until the app was
   * backgrounded and reopened. Android's headless task is the opposite: expo
   * deliberately skips it while the app is foregrounded, so the work has to
   * happen here instead.
   */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const action = response.actionIdentifier;
      if (action !== COMPLETE_ACTION_ID && action !== SNOOZE_ACTION_ID) return;

      if (Platform.OS === 'ios') {
        // Already applied natively and already on the server; this only pulls
        // the queue in now rather than at the next foreground. The entry is
        // guaranteed to be there: expo calls its notification delegates in
        // registration order, and the native handler registers during
        // didFinishLaunching — long before the bridge that emits this event.
        requestReconcile();
        return;
      }

      const reminder = parseTaskReminderNotificationData(response.notification.request.content.data);
      if (!reminder) return;
      if (action === COMPLETE_ACTION_ID) {
        completeAt(reminder.taskId, new Date().toISOString());
        return;
      }
      // No notification is scheduled here: recording the snooze is enough,
      // because the reconciler builds every request from this list.
      const next = pruneSnoozes(
        withSnooze(loadSnoozes(), {
          taskId: reminder.taskId,
          reminderId: reminder.reminderId,
          fireAt: new Date(Date.now() + SNOOZE_DURATION_MS).toISOString(),
        })
      );
      saveSnoozes(next);
      setSnoozes(next);
    });
    return () => subscription.remove();
  }, [completeAt, requestReconcile]);

  return null;
}

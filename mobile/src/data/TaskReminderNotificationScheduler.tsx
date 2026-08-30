import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTasks } from './TaskContext';
import {
  TaskReminderNotificationRequest,
  buildTaskReminderNotificationRequests,
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
  const { state } = useTasks();
  const desired = useMemo(
    () => (state.mode === 'none' ? [] : buildTaskReminderNotificationRequests(state.tasks)),
    [state.mode, state.tasks]
  );
  const desiredRef = useRef<TaskReminderNotificationRequest[]>(desired);
  const reconcileRef = useRef(Promise.resolve());

  useEffect(() => {
    desiredRef.current = desired;
  }, [desired]);

  const requestReconcile = useCallback((snapshot = desiredRef.current) => {
    if (Platform.OS === 'web') return;
    reconcileRef.current = reconcileRef.current
      .catch(() => {})
      .then(() => reconcileTaskReminderNotifications(snapshot))
      .catch((err) => {
        if (__DEV__) console.warn('Task reminder notification sync failed', err);
      });
  }, []);

  useEffect(() => {
    requestReconcile(desired);
  }, [desired, requestReconcile]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') requestReconcile();
    });
    return () => subscription.remove();
  }, [requestReconcile]);

  return null;
}

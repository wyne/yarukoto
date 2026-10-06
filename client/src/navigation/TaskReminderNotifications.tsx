import React, { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTasks } from '../data/TaskContext';
import { parseTaskReminderNotificationData } from '../data/taskReminderNotifications';
import { useDetail } from './DetailContext';

export default function TaskReminderNotifications() {
  const { state } = useTasks();
  const { openTask } = useDetail();
  const handledResponseRef = useRef<string | null>(null);

  const handleResponse = useCallback(
    (response: Notifications.NotificationResponse): boolean => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return false;
      const responseKey = `${response.notification.request.identifier}:${response.notification.date}`;
      if (handledResponseRef.current === responseKey) return true;

      const data = parseTaskReminderNotificationData(response.notification.request.content.data);
      if (!data) return false;
      const task = state.tasks.find((candidate) => candidate.id === data.taskId && !candidate.deletedAt);
      if (!task) return false;

      handledResponseRef.current = responseKey;
      openTask(task.id);
      Notifications.clearLastNotificationResponse();
      return true;
    },
    [openTask, state.tasks]
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    const last = Notifications.getLastNotificationResponse();
    if (last) handleResponse(last);
    return () => subscription.remove();
  }, [handleResponse]);

  return null;
}

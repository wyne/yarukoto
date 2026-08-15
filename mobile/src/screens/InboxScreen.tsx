import React, { useMemo } from 'react';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList, TaskListFilter } from '../navigation/types';
import { useTasks } from '../data/TaskContext';
import { getListById } from '../data/selectors';
import TaskListScreen from './TaskListScreen';

export default function InboxScreen({ route }: BottomTabScreenProps<MainTabParamList, 'InboxTab'>) {
  const { state } = useTasks();
  const { listId, tag } = route.params ?? {};

  // Resolved rather than carried in the params: these arrive from the URL on web,
  // where nothing but the id survives a reload. An id that no longer names a live
  // list — a deleted one, a stale link — falls back to the unfiltered Inbox rather
  // than to a view that is empty for reasons it can't explain.
  const filter = useMemo<TaskListFilter | undefined>(() => {
    if (listId) {
      const list = getListById(state.lists, listId);
      return list ? { type: 'list', value: list.id, label: list.name } : undefined;
    }
    if (tag) return { type: 'tag', value: tag, label: `#${tag}` };
    return undefined;
  }, [listId, tag, state.lists]);

  return <TaskListScreen mode="inbox" filter={filter} />;
}

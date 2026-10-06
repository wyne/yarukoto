import React, { useMemo } from 'react';
import { InboxParams, TaskListFilter } from '../navigation/types';
import { useTasks } from '../data/TaskContext';
import { getListById } from '../data/selectors';
import TaskListScreen from './TaskListScreen';

interface Props {
  route: { params?: InboxParams };
}

export function useInboxFilter(params?: InboxParams) {
  const { state } = useTasks();
  const { listId, folderId, tag } = params ?? {};

  // Resolved rather than carried in the params: these arrive from the URL on web,
  // where nothing but the id survives a reload. An id that no longer names a live
  // container — a deleted one, a stale link — falls back to the unfiltered Inbox rather
  // than to a view that is empty for reasons it can't explain.
  return useMemo<TaskListFilter | undefined>(() => {
    if (listId) {
      const list = getListById(state.lists, listId);
      return list ? { type: 'list', value: list.id, label: list.name } : undefined;
    }
    if (folderId) {
      const folder = state.folders.find((candidate) => candidate.id === folderId && !candidate.deletedAt);
      return folder ? { type: 'folder', value: folder.id, label: folder.name } : undefined;
    }
    if (tag) return { type: 'tag', value: tag, label: `#${tag}` };
    return undefined;
  }, [listId, folderId, tag, state.lists, state.folders]);
}

export default function InboxScreen({ route }: Props) {
  const filter = useInboxFilter(route.params);

  return <TaskListScreen mode="inbox" filter={filter} />;
}

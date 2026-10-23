import { useCallback } from 'react';
import { useTasks } from '../data/TaskContext';
import { activeLists } from '../data/selectors';
import { ListDef, Task } from '../data/types';
import { navigationRef } from './DateTimePickerContext';
import { tabNavigation } from './destinations';
import { useDetailActions } from './DetailContext';
import { useSelectionActions } from './SelectionContext';
import { focusPane } from './focusPanes';
import { afterLayersClose } from '../components/openLayers';

/** Goes to a destination as the nav names it, from anywhere in the app. */
export function goTo(route: string, params?: object) {
  const [name, next] = tabNavigation(route, params);
  (navigationRef.navigate as (name: string, params?: object) => void)('Main', { screen: name, params: next });
}

/**
 * The view a task is shown in when it is gone to: its own list, the Inbox if
 * it has none, or All for a list that has been deleted. The one view that
 * always holds it, whatever its date or tags.
 */
export function taskHome(
  task: Pick<Task, 'listId'>,
  lists: ListDef[]
): { route: string; params?: object; name: string } {
  const listId = task.listId ?? null;
  if (listId === null) return { route: 'InboxTab', name: 'Inbox' };
  const list = activeLists(lists).find((l) => l.id === listId);
  if (list) return { route: 'InboxTab', params: { listId }, name: list.name };
  return { route: 'AllTab', name: 'All' };
}

/**
 * Shows a task in its home view, with the cursor on it, its detail open and
 * the keyboard on the list, as if it had been clicked there. For Go to Task…
 * and the View on the notice of a task added out of sight.
 */
export function useShowTask(): (taskId: string) => void {
  const { state } = useTasks();
  const { openTask } = useDetailActions();
  const { setAnchor, clear: clearSelection } = useSelectionActions();
  return useCallback(
    (taskId: string) => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;
      const { route, params } = taskHome(task, state.lists);
      goTo(route, params);
      clearSelection();
      setAnchor(taskId);
      openTask(taskId);
      afterLayersClose(() => focusPane('list'));
    },
    [state.tasks, state.lists, openTask, setAnchor, clearSelection]
  );
}


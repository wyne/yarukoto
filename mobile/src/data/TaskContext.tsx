import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { FOLDERS, LISTS, buildMockTasks } from './mockData';
import { FolderDef, ListDef, Priority, Task } from './types';
import { addDays, toISODate } from './dateUtils';
import { parseQuickAdd } from './quickAdd';
import { newFolderId, newListId, newSubtaskId, newTaskId } from './ids';
import { DEFAULT_VIEW_OPTIONS, ViewOptions } from './viewOptions';
import { LIST_COLORS } from '../theme/colors';
import { clearServerUrl, loadServerUrl, saveServerUrl } from './storage';

interface State {
  tasks: Task[];
  lists: ListDef[];
  folders: FolderDef[];
  connected: boolean;
  serverUrl: string;
  /** Grouping + sort per view, keyed by viewKey(). Views not in here use the default. */
  viewOptions: Record<string, ViewOptions>;
}

type Action =
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'TOGGLE_COMPLETE'; id: string }
  | { type: 'UPDATE_TASK'; id: string; patch: Partial<Task> }
  | { type: 'DELETE_TASKS'; ids: string[] }
  | { type: 'RESTORE_TASKS'; ids: string[] }
  | { type: 'PURGE_TASKS'; ids: string[] }
  | { type: 'BULK_UPDATE'; ids: string[]; patch: Partial<Task> }
  | { type: 'ADD_SUBTASK'; taskId: string; title: string }
  | { type: 'TOGGLE_SUBTASK'; taskId: string; subtaskId: string }
  | { type: 'SNOOZE_TASK'; id: string }
  | { type: 'REORDER_TASKS'; ids: string[] }
  | { type: 'ADD_LIST'; list: ListDef }
  | { type: 'ADD_FOLDER'; folder: FolderDef }
  | { type: 'UPDATE_LIST'; id: string; patch: Partial<ListDef> }
  | { type: 'SET_VIEW_OPTIONS'; key: string; options: ViewOptions }
  | { type: 'CONNECT'; serverUrl: string }
  | { type: 'DISCONNECT' };


function applyAction(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TASK':
      return { ...state, tasks: [action.task, ...state.tasks] };
    case 'TOGGLE_COMPLETE':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id
            ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined }
            : t
        ),
      };
    case 'UPDATE_TASK':
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)) };
    case 'DELETE_TASKS': {
      // Soft delete: the row stays so Trash can show and restore it, and so other
      // devices learn about the deletion instead of resurrecting the task.
      const now = new Date().toISOString();
      return {
        ...state,
        tasks: state.tasks.map((t) => (action.ids.includes(t.id) ? { ...t, deletedAt: now } : t)),
      };
    }
    case 'RESTORE_TASKS':
      return {
        ...state,
        tasks: state.tasks.map((t) => (action.ids.includes(t.id) ? { ...t, deletedAt: undefined } : t)),
      };
    case 'PURGE_TASKS':
      return { ...state, tasks: state.tasks.filter((t) => !action.ids.includes(t.id)) };
    case 'BULK_UPDATE':
      return {
        ...state,
        tasks: state.tasks.map((t) => (action.ids.includes(t.id) ? { ...t, ...action.patch } : t)),
      };
    case 'ADD_SUBTASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId
            ? { ...t, subtasks: [...t.subtasks, { id: newSubtaskId(), title: action.title, done: false }] }
            : t
        ),
      };
    case 'TOGGLE_SUBTASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId
            ? {
                ...t,
                subtasks: t.subtasks.map((s) => (s.id === action.subtaskId ? { ...s, done: !s.done } : s)),
              }
            : t
        ),
      };
    case 'SNOOZE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, dueDate: toISODate(addDays(new Date(), 1)) } : t
        ),
      };
    case 'REORDER_TASKS': {
      // `order` is global, but a reorder only ever happens inside one visible slice.
      // Redistributing the order values that slice already holds rearranges those
      // tasks relative to each other while leaving every other task's position alone.
      const moving = new Set(action.ids);
      const slots = state.tasks
        .filter((t) => moving.has(t.id))
        .map((t) => t.order)
        .sort((a, b) => a - b);
      const nextOrder = new Map(action.ids.map((id, i) => [id, slots[i]]));
      return {
        ...state,
        tasks: state.tasks.map((t) => (nextOrder.has(t.id) ? { ...t, order: nextOrder.get(t.id)! } : t)),
      };
    }
    case 'ADD_LIST':
      return { ...state, lists: [...state.lists, action.list] };
    case 'ADD_FOLDER':
      return { ...state, folders: [...state.folders, action.folder] };
    case 'UPDATE_LIST':
      return { ...state, lists: state.lists.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)) };
    case 'SET_VIEW_OPTIONS':
      return { ...state, viewOptions: { ...state.viewOptions, [action.key]: action.options } };
    case 'CONNECT':
      return { ...state, connected: true, serverUrl: action.serverUrl };
    case 'DISCONNECT':
      return { ...state, connected: false };
    default:
      return state;
  }
}

/**
 * Stamps `updatedAt` on whatever the action actually changed.
 *
 * Every mutating case builds new objects with `.map()`, which returns the *same*
 * reference for untouched rows — so an identity comparison against the previous
 * state finds exactly the changed records. Doing it here rather than in each case
 * means a future action gets correct timestamps without its author remembering to.
 */
function reducer(state: State, action: Action): State {
  const next = applyAction(state, action);
  if (next === state) return next;

  const now = new Date().toISOString();
  const stamp = <T extends { id: string; updatedAt: string }>(before: T[], after: T[]): T[] => {
    if (after === before) return after;
    const previous = new Map(before.map((r) => [r.id, r]));
    return after.map((r) => (previous.get(r.id) === r ? r : { ...r, updatedAt: now }));
  };

  return {
    ...next,
    tasks: stamp(state.tasks, next.tasks),
    lists: stamp(state.lists, next.lists),
    folders: stamp(state.folders, next.folders),
  };
}

function initState(): State {
  // A stored URL means a previous session connected, so skip first-run.
  const serverUrl = loadServerUrl();
  return {
    tasks: buildMockTasks(new Date()),
    lists: LISTS,
    folders: FOLDERS,
    connected: !!serverUrl,
    serverUrl,
    viewOptions: {},
  };
}

/**
 * Field values a view contributes to tasks created from it — e.g. the Admin list
 * view files new tasks into Admin. Anything typed explicitly wins over these.
 */
export interface QuickAddDefaults {
  listId?: string | null;
  tags?: string[];
  dueDate?: string;
}

/** The most recent completion, offered for undo until it times out. */
export interface PendingUndo {
  taskId: string;
  title: string;
  /** Distinguishes repeat completions of the same task so the toast re-animates. */
  token: number;
}

export const UNDO_TIMEOUT_MS = 5000;

interface TaskContextValue {
  state: State;
  addTaskFromQuickAdd: (text: string, defaults?: QuickAddDefaults) => void;
  toggleComplete: (id: string) => void;
  pendingUndo: PendingUndo | null;
  undoComplete: () => void;
  dismissUndo: () => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTasks: (ids: string[]) => void;
  restoreTasks: (ids: string[]) => void;
  purgeTasks: (ids: string[]) => void;
  bulkUpdate: (ids: string[], patch: Partial<Task>) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  snoozeTask: (id: string) => void;
  /** `ids` is the visible slice in its new order. */
  reorderTasks: (ids: string[]) => void;
  addList: (name: string, folderId: string) => void;
  addFolder: (name: string) => void;
  setListColor: (listId: string, color: string) => void;
  getViewOptions: (key: string) => ViewOptions;
  setViewOptions: (key: string, options: ViewOptions) => void;
  connect: (serverUrl: string) => void;
  disconnect: () => void;
}

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const ding = useAudioPlayer(require('../../assets/sounds/ding.wav'));

  // A completion ding should sound even with the phone in silent mode.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const addTaskFromQuickAdd = useCallback((text: string, defaults?: QuickAddDefaults) => {
    const parsed = parseQuickAdd(text);
    if (!parsed.title.trim()) return;
    const typedList = parsed.listName
      ? state.lists.find((l) => l.name.toLowerCase() === parsed.listName!.toLowerCase())
      : undefined;
    const task: Task = {
      id: newTaskId(),
      title: parsed.title,
      notes: '',
      priority: parsed.priority as Priority,
      // A typed date overrides the view's date; tags from both are merged.
      dueDate: parsed.dueDate ?? defaults?.dueDate,
      dueTime: parsed.dueTime,
      listId: typedList ? typedList.id : (defaults?.listId ?? null),
      tags: Array.from(new Set([...(defaults?.tags ?? []), ...parsed.tags])),
      subtasks: [],
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: -Date.now(),
    };
    dispatch({ type: 'ADD_TASK', task });
  }, [state.lists]);

  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);

  // Only completing offers an undo — un-completing is already its own undo.
  const toggleComplete = useCallback(
    (id: string) => {
      const task = state.tasks.find((t) => t.id === id);
      dispatch({ type: 'TOGGLE_COMPLETE', id });
      if (task && !task.completed) {
        ding.seekTo(0);
        ding.play();
      }
      setPendingUndo(task && !task.completed ? { taskId: id, title: task.title, token: Date.now() } : null);
    },
    [state.tasks, ding]
  );

  const dismissUndo = useCallback(() => setPendingUndo(null), []);

  const undoComplete = useCallback(() => {
    setPendingUndo((current) => {
      if (current) {
        // Set the flag directly rather than toggling, so this stays correct even if
        // the task was un-completed by other means in the meantime.
        dispatch({ type: 'UPDATE_TASK', id: current.taskId, patch: { completed: false, completedAt: undefined } });
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pendingUndo) return;
    const t = setTimeout(() => setPendingUndo(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pendingUndo]);
  const updateTask = useCallback((id: string, patch: Partial<Task>) => dispatch({ type: 'UPDATE_TASK', id, patch }), []);
  const deleteTasks = useCallback((ids: string[]) => dispatch({ type: 'DELETE_TASKS', ids }), []);
  const restoreTasks = useCallback((ids: string[]) => dispatch({ type: 'RESTORE_TASKS', ids }), []);
  const purgeTasks = useCallback((ids: string[]) => dispatch({ type: 'PURGE_TASKS', ids }), []);
  const bulkUpdate = useCallback((ids: string[], patch: Partial<Task>) => dispatch({ type: 'BULK_UPDATE', ids, patch }), []);
  const addSubtask = useCallback((taskId: string, title: string) => dispatch({ type: 'ADD_SUBTASK', taskId, title }), []);
  const toggleSubtask = useCallback(
    (taskId: string, subtaskId: string) => dispatch({ type: 'TOGGLE_SUBTASK', taskId, subtaskId }),
    []
  );
  const snoozeTask = useCallback((id: string) => dispatch({ type: 'SNOOZE_TASK', id }), []);
  const reorderTasks = useCallback((ids: string[]) => dispatch({ type: 'REORDER_TASKS', ids }), []);
  const addList = useCallback((name: string, folderId: string) => {
    dispatch({
      type: 'ADD_LIST',
      list: {
        id: newListId(),
        name,
        folderId,
        color: LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)],
        updatedAt: new Date().toISOString(),
      },
    });
  }, []);
  const setListColor = useCallback(
    (listId: string, color: string) => dispatch({ type: 'UPDATE_LIST', id: listId, patch: { color } }),
    []
  );
  const addFolder = useCallback((name: string) => {
    dispatch({ type: 'ADD_FOLDER', folder: { id: newFolderId(), name, updatedAt: new Date().toISOString() } });
  }, []);
  const getViewOptions = useCallback(
    (key: string) => state.viewOptions[key] ?? DEFAULT_VIEW_OPTIONS,
    [state.viewOptions]
  );
  const setViewOptions = useCallback(
    (key: string, options: ViewOptions) => dispatch({ type: 'SET_VIEW_OPTIONS', key, options }),
    []
  );
  const connect = useCallback((serverUrl: string) => {
    saveServerUrl(serverUrl);
    dispatch({ type: 'CONNECT', serverUrl });
  }, []);
  const disconnect = useCallback(() => {
    clearServerUrl();
    dispatch({ type: 'DISCONNECT' });
  }, []);

  const value = useMemo<TaskContextValue>(
    () => ({
      state,
      addTaskFromQuickAdd,
      toggleComplete,
      pendingUndo,
      undoComplete,
      dismissUndo,
      updateTask,
      deleteTasks,
      restoreTasks,
      purgeTasks,
      bulkUpdate,
      addSubtask,
      toggleSubtask,
      snoozeTask,
      reorderTasks,
      addList,
      addFolder,
      setListColor,
      getViewOptions,
      setViewOptions,
      connect,
      disconnect,
    }),
    [
      state,
      addTaskFromQuickAdd,
      toggleComplete,
      pendingUndo,
      undoComplete,
      dismissUndo,
      updateTask,
      deleteTasks,
      restoreTasks,
      purgeTasks,
      bulkUpdate,
      addSubtask,
      toggleSubtask,
      snoozeTask,
      reorderTasks,
      addList,
      addFolder,
      setListColor,
      getViewOptions,
      setViewOptions,
      connect,
      disconnect,
    ]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks(): TaskContextValue {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTasks must be used within a TaskProvider');
  return ctx;
}

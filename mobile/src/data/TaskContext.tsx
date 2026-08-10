import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { FOLDERS, LISTS, buildMockTasks } from './mockData';
import { FolderDef, ListDef, Priority, ReminderOption, Task } from './types';
import { addDays, toISODate } from './dateUtils';
import { parseQuickAdd } from './quickAdd';
import { DEFAULT_VIEW_OPTIONS, ViewOptions } from './viewOptions';

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
  | { type: 'BULK_UPDATE'; ids: string[]; patch: Partial<Task> }
  | { type: 'ADD_SUBTASK'; taskId: string; title: string }
  | { type: 'TOGGLE_SUBTASK'; taskId: string; subtaskId: string }
  | { type: 'SNOOZE_TASK'; id: string }
  | { type: 'ADD_LIST'; list: ListDef }
  | { type: 'SET_VIEW_OPTIONS'; key: string; options: ViewOptions }
  | { type: 'CONNECT'; serverUrl: string }
  | { type: 'DISCONNECT' };

const LIST_COLOR_PALETTE = ['#2E62D9', '#DB8A00', '#1E7A3C', '#8A5FD6', '#C22B23', '#0E8A8A'];

function reducer(state: State, action: Action): State {
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
    case 'DELETE_TASKS':
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
            ? { ...t, subtasks: [...t.subtasks, { id: `st-${Date.now()}`, title: action.title, done: false }] }
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
    case 'ADD_LIST':
      return { ...state, lists: [...state.lists, action.list] };
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

function initState(): State {
  return {
    tasks: buildMockTasks(new Date()),
    lists: LISTS,
    folders: FOLDERS,
    connected: false,
    serverUrl: '',
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
  bulkUpdate: (ids: string[], patch: Partial<Task>) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  snoozeTask: (id: string) => void;
  addList: (name: string, folderId: string) => void;
  getViewOptions: (key: string) => ViewOptions;
  setViewOptions: (key: string, options: ViewOptions) => void;
  connect: (serverUrl: string) => void;
  disconnect: () => void;
}

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  const addTaskFromQuickAdd = useCallback((text: string, defaults?: QuickAddDefaults) => {
    const parsed = parseQuickAdd(text);
    if (!parsed.title.trim()) return;
    const task: Task = {
      id: `t-${Date.now()}`,
      title: parsed.title,
      notes: '',
      priority: parsed.priority as Priority,
      // A typed date overrides the view's date; tags from both are merged.
      dueDate: parsed.dueDate ?? defaults?.dueDate,
      dueTime: parsed.dueTime,
      reminder: 'none' as ReminderOption,
      listId: defaults?.listId ?? null,
      tags: Array.from(new Set([...(defaults?.tags ?? []), ...parsed.tags])),
      subtasks: [],
      completed: false,
      createdAt: new Date().toISOString(),
      order: -Date.now(),
    };
    dispatch({ type: 'ADD_TASK', task });
  }, []);

  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);

  // Only completing offers an undo — un-completing is already its own undo.
  const toggleComplete = useCallback(
    (id: string) => {
      const task = state.tasks.find((t) => t.id === id);
      dispatch({ type: 'TOGGLE_COMPLETE', id });
      setPendingUndo(task && !task.completed ? { taskId: id, title: task.title, token: Date.now() } : null);
    },
    [state.tasks]
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
  const bulkUpdate = useCallback((ids: string[], patch: Partial<Task>) => dispatch({ type: 'BULK_UPDATE', ids, patch }), []);
  const addSubtask = useCallback((taskId: string, title: string) => dispatch({ type: 'ADD_SUBTASK', taskId, title }), []);
  const toggleSubtask = useCallback(
    (taskId: string, subtaskId: string) => dispatch({ type: 'TOGGLE_SUBTASK', taskId, subtaskId }),
    []
  );
  const snoozeTask = useCallback((id: string) => dispatch({ type: 'SNOOZE_TASK', id }), []);
  const addList = useCallback((name: string, folderId: string) => {
    dispatch({
      type: 'ADD_LIST',
      list: {
        id: `l-${Date.now()}`,
        name,
        folderId,
        color: LIST_COLOR_PALETTE[Math.floor(Math.random() * LIST_COLOR_PALETTE.length)],
      },
    });
  }, []);
  const getViewOptions = useCallback(
    (key: string) => state.viewOptions[key] ?? DEFAULT_VIEW_OPTIONS,
    [state.viewOptions]
  );
  const setViewOptions = useCallback(
    (key: string, options: ViewOptions) => dispatch({ type: 'SET_VIEW_OPTIONS', key, options }),
    []
  );
  const connect = useCallback((serverUrl: string) => dispatch({ type: 'CONNECT', serverUrl }), []);
  const disconnect = useCallback(() => dispatch({ type: 'DISCONNECT' }), []);

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
      bulkUpdate,
      addSubtask,
      toggleSubtask,
      snoozeTask,
      addList,
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
      bulkUpdate,
      addSubtask,
      toggleSubtask,
      snoozeTask,
      addList,
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

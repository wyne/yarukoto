import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { buildSampleData } from './sampleData';
import { FolderDef, ListDef, Priority, Task } from './types';
import { addDays, toISODate } from './dateUtils';
import { parseQuickAdd } from './quickAdd';
import { newFolderId, newListId, newSubtaskId, newTaskId } from './ids';
import { DEFAULT_VIEW_OPTIONS, ViewOptions } from './viewOptions';
import { LIST_COLORS } from '../theme/colors';
import {
  AppMode,
  clearServerUrl,
  clearToken,
  loadMode,
  loadServerUrl,
  loadToken,
  saveMode,
  saveServerUrl,
  saveToken,
} from './storage';
import { ApiError, createApi } from './api';
import { Outbox, SyncStatus, mergeBatch, pullSince, pushDirty } from './sync';
export { ApiError } from './api';
export type { SyncState, SyncStatus } from './sync';

interface State {
  tasks: Task[];
  lists: ListDef[];
  folders: FolderDef[];
  mode: AppMode;
  serverUrl: string;
  token: string;
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
  | { type: 'CONNECT'; serverUrl: string; token: string }
  | { type: 'USE_SAMPLE_DATA'; data: ReturnType<typeof buildSampleData> }
  | { type: 'DISCONNECT' }
  | { type: 'HYDRATE'; tasks: Task[]; lists: ListDef[]; folders: FolderDef[] }
  | { type: 'MERGE'; tasks: Task[]; lists: ListDef[]; folders: FolderDef[] };


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
      // Server data arrives via sync; nothing is seeded locally.
      return { ...state, mode: 'server', serverUrl: action.serverUrl, token: action.token, tasks: [], lists: [], folders: [] };
    case 'USE_SAMPLE_DATA':
      return { ...state, mode: 'sample', serverUrl: '', token: '', ...action.data };
    case 'DISCONNECT':
      return { ...state, mode: 'none', serverUrl: '', token: '', tasks: [], lists: [], folders: [] };
    case 'HYDRATE':
      return { ...state, tasks: action.tasks, lists: action.lists, folders: action.folders };
    case 'MERGE':
      return {
        ...state,
        tasks: mergeBatch(state.tasks, action.tasks, mergeDirtyIds),
        lists: mergeBatch(state.lists, action.lists, mergeDirtyIds),
        folders: mergeBatch(state.folders, action.folders, mergeDirtyIds),
      };
    default:
      return state;
  }
}

/**
 * `MERGE` needs to know which ids are still dirty (a local edit not yet pushed),
 * but the reducer is a pure function with no access to the outbox. The dispatcher
 * stashes a snapshot here immediately before dispatching MERGE — safe because JS
 * is single-threaded, so nothing else can run between the snapshot and the
 * reducer picking it up.
 */
let mergeDirtyIds = new Set<string>();
export function setMergeDirtyIds(ids: Set<string>): void {
  mergeDirtyIds = ids;
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
  // Rows from the server already carry their true updatedAt; restamping them
  // here would make every pull look like a fresh local edit.
  if (action.type === 'HYDRATE' || action.type === 'MERGE') return next;

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
  const mode = loadMode();
  // Sample data is rebuilt rather than restored, so its dates stay relative to
  // today. Server data is empty until the first sync populates it.
  const seeded = mode === 'sample' ? buildSampleData(new Date()) : { tasks: [], lists: [], folders: [] };
  return {
    ...seeded,
    mode,
    serverUrl: mode === 'server' ? loadServerUrl() : '',
    token: mode === 'server' ? loadToken() : '',
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
  /** Validates against the server before committing; throws ApiError on failure. */
  connect: (serverUrl: string, token: string) => Promise<void>;
  /** Load the sample dataset and work entirely offline. */
  useSampleData: () => void;
  disconnect: () => void;
  /** Live sync state, for the indicator in the sidebar. Only meaningful in server mode. */
  syncStatus: SyncStatus;
}

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const ding = useAudioPlayer(require('../../assets/sounds/ding.wav'));

  // A completion ding should sound even with the phone in silent mode.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  // Ids changed locally since the last successful push. A ref, not state: it's
  // mutated on every edit, and none of that should trigger a re-render.
  const outboxRef = useRef(new Outbox());

  // The sync loop below runs on its own timer, outside React's render cycle, so
  // it reads state through a ref to always see the latest values.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Session-scoped, deliberately not persisted — see the note in storage.ts.
  // Undefined means the next pull is a full hydrate.
  const cursorRef = useRef<string | undefined>(undefined);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'syncing', pending: 0 });

  // Marking dirty updates the indicator immediately, so an edit reads as pending
  // the moment it's made rather than up to a cycle later.
  const markDirty = useCallback((ids: string[]) => {
    outboxRef.current.mark(ids);
    setSyncStatus((s) => {
      const pending = outboxRef.current.size;
      // 'offline' and 'unauthorized' are more important to keep on screen than
      // 'pending', and their labels already carry the count. 'syncing' means a
      // cycle is mid-flight, and it will settle the state when it finishes.
      const state = s.state === 'synced' && pending > 0 ? 'pending' : s.state;
      if (s.pending === pending && s.state === state) return s;
      return { ...s, pending, state };
    });
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
    markDirty([task.id]);
  }, [state.lists, markDirty]);

  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);

  // Only completing offers an undo — un-completing is already its own undo.
  const toggleComplete = useCallback(
    (id: string) => {
      const task = state.tasks.find((t) => t.id === id);
      dispatch({ type: 'TOGGLE_COMPLETE', id });
      markDirty([id]);
      if (task && !task.completed) {
        ding.seekTo(0);
        ding.play();
      }
      setPendingUndo(task && !task.completed ? { taskId: id, title: task.title, token: Date.now() } : null);
    },
    [state.tasks, ding, markDirty]
  );

  const dismissUndo = useCallback(() => setPendingUndo(null), []);

  const undoComplete = useCallback(() => {
    setPendingUndo((current) => {
      if (current) {
        // Set the flag directly rather than toggling, so this stays correct even if
        // the task was un-completed by other means in the meantime.
        dispatch({ type: 'UPDATE_TASK', id: current.taskId, patch: { completed: false, completedAt: undefined } });
        markDirty([current.taskId]);
      }
      return null;
    });
  }, [markDirty]);

  useEffect(() => {
    if (!pendingUndo) return;
    const t = setTimeout(() => setPendingUndo(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pendingUndo]);
  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      dispatch({ type: 'UPDATE_TASK', id, patch });
      markDirty([id]);
    },
    [markDirty]
  );
  const deleteTasks = useCallback(
    (ids: string[]) => {
      dispatch({ type: 'DELETE_TASKS', ids });
      markDirty(ids);
    },
    [markDirty]
  );
  const restoreTasks = useCallback(
    (ids: string[]) => {
      dispatch({ type: 'RESTORE_TASKS', ids });
      markDirty(ids);
    },
    [markDirty]
  );
  // Purging is a hard, local-only delete: the sync protocol only ever upserts, so
  // there is nothing to push. The server's own retention job removes the row
  // independently once its trash window elapses.
  const purgeTasks = useCallback((ids: string[]) => dispatch({ type: 'PURGE_TASKS', ids }), []);
  const bulkUpdate = useCallback(
    (ids: string[], patch: Partial<Task>) => {
      dispatch({ type: 'BULK_UPDATE', ids, patch });
      markDirty(ids);
    },
    [markDirty]
  );
  const addSubtask = useCallback(
    (taskId: string, title: string) => {
      dispatch({ type: 'ADD_SUBTASK', taskId, title });
      markDirty([taskId]);
    },
    [markDirty]
  );
  const toggleSubtask = useCallback(
    (taskId: string, subtaskId: string) => {
      dispatch({ type: 'TOGGLE_SUBTASK', taskId, subtaskId });
      markDirty([taskId]);
    },
    [markDirty]
  );
  const snoozeTask = useCallback(
    (id: string) => {
      dispatch({ type: 'SNOOZE_TASK', id });
      markDirty([id]);
    },
    [markDirty]
  );
  const reorderTasks = useCallback(
    (ids: string[]) => {
      dispatch({ type: 'REORDER_TASKS', ids });
      markDirty(ids);
    },
    [markDirty]
  );
  const addList = useCallback(
    (name: string, folderId: string) => {
      const list = {
        id: newListId(),
        name,
        folderId,
        color: LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)],
        updatedAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_LIST', list });
      markDirty([list.id]);
    },
    [markDirty]
  );
  const setListColor = useCallback(
    (listId: string, color: string) => {
      dispatch({ type: 'UPDATE_LIST', id: listId, patch: { color } });
      markDirty([listId]);
    },
    [markDirty]
  );
  const addFolder = useCallback(
    (name: string) => {
      const folder = { id: newFolderId(), name, updatedAt: new Date().toISOString() };
      dispatch({ type: 'ADD_FOLDER', folder });
      markDirty([folder.id]);
    },
    [markDirty]
  );
  const getViewOptions = useCallback(
    (key: string) => state.viewOptions[key] ?? DEFAULT_VIEW_OPTIONS,
    [state.viewOptions]
  );
  const setViewOptions = useCallback(
    (key: string, options: ViewOptions) => dispatch({ type: 'SET_VIEW_OPTIONS', key, options }),
    []
  );
  const connect = useCallback(async (serverUrl: string, token: string) => {
    const url = serverUrl.replace(/\/+$/, '');
    const api = createApi(url, token);
    // A full hydrate doubles as validation: a bad URL or token throws ApiError
    // here, before anything is persisted or the UI leaves FirstRun.
    const batch = await api.pull(undefined);

    saveServerUrl(url);
    saveToken(token);
    saveMode('server');
    cursorRef.current = batch.now;
    outboxRef.current = new Outbox();

    dispatch({ type: 'CONNECT', serverUrl: url, token });
    dispatch({ type: 'HYDRATE', tasks: batch.tasks, lists: batch.lists, folders: batch.folders });
  }, []);
  const useSampleData = useCallback(() => {
    clearServerUrl();
    clearToken();
    cursorRef.current = undefined;
    saveMode('sample');
    dispatch({ type: 'USE_SAMPLE_DATA', data: buildSampleData(new Date()) });
  }, []);
  const disconnect = useCallback(() => {
    clearServerUrl();
    clearToken();
    cursorRef.current = undefined;
    saveMode('none');
    dispatch({ type: 'DISCONNECT' });
  }, []);

  // Push dirty records, then pull. Runs once on connect and on a timer while
  // connected; a change in between waits for the next tick rather than firing
  // its own request, which keeps concurrent pushes from racing each other.
  useEffect(() => {
    if (state.mode !== 'server') return;
    const api = createApi(state.serverUrl, state.token);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const cycle = async () => {
      setSyncStatus((s) => ({ ...s, state: 'syncing' }));
      try {
        if (outboxRef.current.size > 0) {
          const pushed = await pushDirty(api, outboxRef.current, stateRef.current);
          setMergeDirtyIds(outboxRef.current.snapshot());
          dispatch({ type: 'MERGE', tasks: pushed.tasks, lists: pushed.lists, folders: pushed.folders });
        }
        const pulled = await pullSince(api, cursorRef.current);
        cursorRef.current = pulled.now;
        setMergeDirtyIds(outboxRef.current.snapshot());
        dispatch({ type: 'MERGE', tasks: pulled.tasks, lists: pulled.lists, folders: pulled.folders });

        // Anything marked dirty *during* the request is still queued, so this is
        // only fully "synced" if the outbox came out empty.
        const pending = outboxRef.current.size;
        setSyncStatus({
          state: pending > 0 ? 'pending' : 'synced',
          pending,
          lastSyncedAt: new Date().toISOString(),
        });
      } catch (err) {
        // Local edits stay queued either way; the next tick retries. A rejected
        // token is called out separately because, unlike being offline, waiting
        // will never fix it.
        const unauthorized = err instanceof ApiError && err.status === 401;
        setSyncStatus((s) => ({
          ...s,
          state: unauthorized ? 'unauthorized' : 'offline',
          pending: outboxRef.current.size,
        }));
      }
      if (!cancelled) timer = setTimeout(cycle, 5000);
    };

    cycle();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.mode, state.serverUrl, state.token]);

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
      useSampleData,
      disconnect,
      syncStatus,
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
      useSampleData,
      disconnect,
      syncStatus,
    ]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks(): TaskContextValue {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTasks must be used within a TaskProvider');
  return ctx;
}

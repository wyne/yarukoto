import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { buildSampleData } from './sampleData';
import {
  FolderDef,
  HouseholdMember,
  ListDef,
  Priority,
  SERVER_FEATURES,
  SavedFilter,
  ServerFeature,
  Task,
  ViewPref,
} from './types';
import { TaskCriteria } from './taskFilter';
import { addDays, toISODate } from './dateUtils';
import { parseQuickAdd } from './quickAdd';
import { normalizeTaskPatch } from './reminders';
import { completeRepeating, skipRepeating } from './recurrence';
import { newFolderId, newListId, newSavedFilterId, newSubtaskId, newTaskId } from './ids';
import {
  Arrangements,
  DEFAULT_VIEW_OPTIONS,
  SortBy,
  ViewOptions,
  arrangementFrom,
  viewOptionsFor,
} from './viewOptions';
import { LIST_COLORS } from '../theme/colors';
import {
  AppMode,
  clearDirtyIds,
  addSavedServer,
  clearServerSnapshot,
  clearServerUrl,
  clearToken,
  loadDirtyIds,
  loadMode,
  loadServerUrl,
  loadServerSnapshot,
  loadToken,
  saveDirtyIds,
  removeSavedServer as removeSavedServerStorage,
  saveMode,
  saveServerUrl,
  saveServerSnapshot,
  saveToken,
} from './storage';
import { ApiError, SignedOutReason, createApi, signedOutReason } from './api';
import { Household, householdFrom, ownsList } from './household';
export { ownsList } from './household';
export type { Household } from './household';
import { setNativeCredentials } from '../../modules/notification-actions/src/NotificationActionsModule';
import { Outbox, SyncStatus, dropRemoved, hasServerFeature, mergeBatch, pullSince, pushDirty } from './sync';
import { activeFolders, activeLists } from './selectors';
import { Ordered, applyOrders, changedOrders, computeOrders, reorderRows } from './ordering';
export { ApiError } from './api';
export type { SyncState, SyncStatus } from './sync';

interface State {
  tasks: Task[];
  lists: ListDef[];
  folders: FolderDef[];
  mode: AppMode;
  serverUrl: string;
  token: string;
  /**
   * Grouping + sort per view, one synced record per view keyed by viewKey().
   * Views without a record use the default.
   */
  viewPrefs: ViewPref[];
  /** Named Browse questions, synced behind the `savedFilters` feature. */
  savedFilters: SavedFilter[];
}

type Action =
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'TOGGLE_COMPLETE'; id: string; at: string }
  | { type: 'COMPLETE_AT'; id: string; at: string }
  | { type: 'SKIP_OCCURRENCE'; id: string; at: string }
  | { type: 'UPDATE_TASK'; id: string; patch: Partial<Task> }
  | { type: 'DELETE_TASKS'; ids: string[] }
  | { type: 'RESTORE_TASKS'; ids: string[] }
  | { type: 'PURGE_TASKS'; ids: string[] }
  | { type: 'BULK_UPDATE'; ids: string[]; patch: Partial<Task> }
  | { type: 'ADD_SUBTASK'; taskId: string; title: string }
  | { type: 'TOGGLE_SUBTASK'; taskId: string; subtaskId: string }
  | { type: 'SET_DUE_DAY'; id: string; days: number }
  | { type: 'REORDER_TASKS'; orders: Map<string, number> }
  | { type: 'SET_ARRANGEMENT'; key: string; sortBy: SortBy; groupKey: string; ids: string[] }
  | { type: 'CLEAR_ARRANGEMENT'; key: string; sortBy: SortBy }
  | { type: 'REORDER_LIST'; id: string; folderId: string | null; prevId: string | null; nextId: string | null }
  | { type: 'REORDER_FOLDER'; id: string; prevId: string | null; nextId: string | null }
  | { type: 'ADD_LIST'; list: ListDef }
  | { type: 'ADD_FOLDER'; folder: FolderDef }
  | { type: 'UPDATE_LIST'; id: string; patch: Partial<ListDef> }
  | { type: 'UPDATE_FOLDER'; id: string; patch: Partial<FolderDef> }
  | { type: 'DELETE_LIST'; id: string }
  | { type: 'DELETE_FOLDER'; id: string }
  | { type: 'SET_VIEW_OPTIONS'; key: string; options: ViewOptions }
  | { type: 'ADD_SAVED_FILTER'; filter: SavedFilter }
  | { type: 'UPDATE_SAVED_FILTER'; id: string; patch: Partial<Pick<SavedFilter, 'name' | 'criteria'>> }
  | { type: 'DELETE_SAVED_FILTER'; id: string }
  | { type: 'CONNECT'; serverUrl: string; token: string }
  | { type: 'SET_TOKEN'; token: string }
  | { type: 'USE_SAMPLE_DATA'; data: ReturnType<typeof buildSampleData> }
  | { type: 'DISCONNECT' }
  | ({ type: 'HYDRATE' } & Collections)
  | ({ type: 'MERGE'; dirtyIds: ReadonlySet<string>; removed?: { tasks: string[]; lists: string[] } } & Collections);

interface Collections {
  tasks: Task[];
  lists: ListDef[];
  folders: FolderDef[];
  viewPrefs: ViewPref[];
  savedFilters: SavedFilter[];
}


/**
 * Soft-deletes the saved view options belonging to lists that were just deleted,
 * so a deleted list doesn't leave its grouping behind on every device forever.
 * Filtered views are hosted by whichever tab opened them, so the list id is matched
 * on the filter part of the key rather than on the whole thing.
 */
function viewPrefIdsForLists(prefs: ViewPref[], listIds: string[]): string[] {
  const suffixes = listIds.map((id) => `:list:${id}`);
  return prefs.filter((p) => !p.deletedAt && suffixes.some((s) => p.id.endsWith(s))).map((p) => p.id);
}

function tombstoneListPrefs(prefs: ViewPref[], listIds: string[], now: string): ViewPref[] {
  if (listIds.length === 0) return prefs;
  const doomed = new Set(viewPrefIdsForLists(prefs, listIds));
  if (doomed.size === 0) return prefs;
  return prefs.map((p) => (doomed.has(p.id) ? { ...p, deletedAt: now } : p));
}

function applyTaskPatch(task: Task, patch: Partial<Task>): Task {
  const normalized = normalizeTaskPatch(patch);
  if (
    !task.dueDate &&
    !Object.prototype.hasOwnProperty.call(normalized, 'dueDate') &&
    normalized.reminders &&
    normalized.reminders.length > 0
  ) {
    return { ...task, ...normalized, dueDate: toISODate(new Date()) };
  }
  return { ...task, ...normalized };
}

/**
 * The nav's root: the folders and the lists that aren't inside one, which sit
 * among them as siblings and therefore share a single run of positions.
 *
 * Applying the resulting orders to both collections is safe because list and
 * folder ids are prefixed (`l-`, `f-`) and cannot collide.
 */
function rootScope(folders: FolderDef[], lists: ListDef[]): Ordered[] {
  return [
    ...folders.filter((f) => !f.deletedAt),
    ...lists.filter((l) => l.folderId === null && !l.deletedAt),
  ];
}

/** Applies a change to one view's arrangements, dropping keys that empty out. */
function withArrangements(
  prefs: ViewPref[],
  key: string,
  change: (current: Arrangements) => Arrangements
): ViewPref[] {
  return upsertViewPref(prefs, key, (existing) => ({
    arrangements: change(existing.arrangements ?? {}),
  }));
}

/**
 * Creates or patches one view's saved options. `patch` receives the existing
 * record so a caller can change one field without restating the rest.
 */
function upsertViewPref(
  prefs: ViewPref[],
  key: string,
  patch: (existing: ViewPref) => Partial<ViewPref>
): ViewPref[] {
  const existing = prefs.find((p) => p.id === key);
  const base: ViewPref = existing ?? {
    id: key,
    ...DEFAULT_VIEW_OPTIONS,
    updatedAt: new Date().toISOString(),
  };
  const pref: ViewPref = {
    ...base,
    ...patch(base),
    id: key,
    // A view configured again after its list was deleted and restored should
    // come back to life rather than stay tombstoned.
    deletedAt: undefined,
  };
  return existing ? prefs.map((p) => (p.id === key ? pref : p)) : [...prefs, pref];
}

/**
 * Checks off a repeating task: the series moves to its next date and the
 * occurrence stays behind as a completed copy (see shared/recurrence.ts). Null
 * when the task doesn't roll — it doesn't repeat, or this was its last date.
 */
function rollRepeating(tasks: Task[], id: string, at: string): Task[] | null {
  const index = tasks.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const rolled = completeRepeating(tasks[index], at, toISODate(new Date(at)));
  if (!rolled) return null;
  // The copy's id is derived, so completing the same occurrence again — after
  // an undo, or a notification tap folded in late — replaces it, never doubles.
  const rest = tasks.filter((t) => t.id !== rolled.occurrence.id);
  const position = rest.findIndex((t) => t.id === id);
  return [...rest.slice(0, position), rolled.series, rolled.occurrence, ...rest.slice(position + 1)];
}

function applyAction(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TASK':
      return { ...state, tasks: [action.task, ...state.tasks] };
    case 'TOGGLE_COMPLETE': {
      const rolled = rollRepeating(state.tasks, action.id, action.at);
      if (rolled) return { ...state, tasks: rolled };
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, completed: !t.completed, completedAt: !t.completed ? action.at : undefined } : t
        ),
      };
    }
    case 'SKIP_OCCURRENCE':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? (skipRepeating(t, action.at, toISODate(new Date(action.at))) ?? t) : t)),
      };
    /**
     * Completing a task at a stated time rather than now — a notification's
     * "Mark done", which may have been tapped hours before the app next ran.
     *
     * Carrying the real time matters for more than tidiness. `updatedAt` is what
     * last-write-wins compares, so stamping the drain time instead would let a
     * tap from this morning outrank an edit made on another device this
     * afternoon. The guard below is the same one the server applies, so both
     * sides reach the same answer about which change is older.
     */
    case 'COMPLETE_AT': {
      const current = state.tasks.find((t) => t.id === action.id);
      if (current && current.updatedAt < action.at) {
        const rolled = rollRepeating(state.tasks, action.id, action.at);
        if (rolled) return { ...state, tasks: rolled };
      }
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id && !t.completed && t.updatedAt < action.at
            ? { ...t, completed: true, completedAt: action.at, updatedAt: action.at }
            : t
        ),
      };
    }
    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? applyTaskPatch(t, action.patch) : t)),
      };
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
        tasks: state.tasks.map((t) => (action.ids.includes(t.id) ? applyTaskPatch(t, action.patch) : t)),
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
    // Resolved against the clock at dispatch rather than at render, so a row
    // left on screen overnight still means the day it is pressed on.
    case 'SET_DUE_DAY':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, dueDate: toISODate(addDays(new Date(), action.days)) } : t
        ),
      };
    case 'REORDER_TASKS':
      // Tasks rank globally, so their scope is the whole collection.
      return {
        ...state,
        tasks: applyOrders(state.tasks, action.orders),
      };
    case 'SET_ARRANGEMENT':
      // A drag under an active sort. The whole group's sequence is recorded on the
      // view; no task is touched, so the Custom order and every other view are left
      // exactly as they were.
      return {
        ...state,
        viewPrefs: withArrangements(state.viewPrefs, action.key, (current) => ({
          ...current,
          [action.sortBy]: {
            ...current[action.sortBy],
            [action.groupKey]: arrangementFrom(action.ids),
          },
        })),
      };
    case 'CLEAR_ARRANGEMENT': {
      return {
        ...state,
        viewPrefs: withArrangements(state.viewPrefs, action.key, ({ [action.sortBy]: _drop, ...rest }) => rest),
      };
    }
    /**
     * Relocation and reordering in one pass: the list is moved to its
     * destination *first*, so `prevId`/`nextId` — which the drag read off that
     * destination — resolve against a scope it already belongs to. The other way
     * round would mean looking its new neighbours up where it came from.
     */
    case 'REORDER_LIST': {
      const relocated = state.lists.map((l) =>
        l.id === action.id && l.folderId !== action.folderId ? { ...l, folderId: action.folderId } : l
      );
      if (action.folderId !== null) {
        const scope = relocated.filter((l) => l.folderId === action.folderId && !l.deletedAt);
        return {
          ...state,
          lists: reorderRows(relocated, scope, [action.id], action.prevId, action.nextId),
        };
      }
      // Dropped at the root, where the peers are the folders as well as the
      // other loose lists — so the positions are worked out once over both and
      // then written to each collection.
      const orders = computeOrders(
        rootScope(state.folders, relocated),
        [action.id],
        action.prevId,
        action.nextId
      );
      return { ...state, lists: applyOrders(relocated, orders), folders: applyOrders(state.folders, orders) };
    }
    case 'REORDER_FOLDER': {
      const orders = computeOrders(
        rootScope(state.folders, state.lists),
        [action.id],
        action.prevId,
        action.nextId
      );
      return { ...state, folders: applyOrders(state.folders, orders), lists: applyOrders(state.lists, orders) };
    }
    case 'ADD_LIST':
      return { ...state, lists: [...state.lists, action.list] };
    case 'ADD_FOLDER':
      return { ...state, folders: [...state.folders, action.folder] };
    case 'UPDATE_LIST':
      return { ...state, lists: state.lists.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)) };
    case 'UPDATE_FOLDER':
      return { ...state, folders: state.folders.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)) };
    case 'DELETE_LIST': {
      // Deleting a container never destroys tasks — they fall back to Inbox, which
      // is the one place that can hold a task with no list.
      const now = new Date().toISOString();
      return {
        ...state,
        lists: state.lists.map((l) => (l.id === action.id ? { ...l, deletedAt: now } : l)),
        tasks: state.tasks.map((t) => (t.listId === action.id ? { ...t, listId: null } : t)),
        viewPrefs: tombstoneListPrefs(state.viewPrefs, [action.id], now),
      };
    }
    case 'DELETE_FOLDER': {
      // A list can't exist outside a folder (`folderId` is required), so deleting
      // one has to take its lists with it. Their tasks still land in Inbox.
      const now = new Date().toISOString();
      const doomed = new Set(
        state.lists.filter((l) => l.folderId === action.id && !l.deletedAt).map((l) => l.id)
      );
      return {
        ...state,
        folders: state.folders.map((f) => (f.id === action.id ? { ...f, deletedAt: now } : f)),
        lists: state.lists.map((l) => (doomed.has(l.id) ? { ...l, deletedAt: now } : l)),
        tasks: state.tasks.map((t) => (t.listId && doomed.has(t.listId) ? { ...t, listId: null } : t)),
        viewPrefs: tombstoneListPrefs(state.viewPrefs, [...doomed], now),
      };
    }
    case 'SET_VIEW_OPTIONS':
      return {
        ...state,
        // Arrangements are keyed by sort and by group, so switching either one
        // simply stops matching — the ones that still apply keep applying, and
        // switching back finds the old arrangement intact.
        viewPrefs: upsertViewPref(state.viewPrefs, action.key, () => ({
          groupBy: action.options.groupBy,
          sortBy: action.options.sortBy,
          arrangements: action.options.arrangements,
        })),
      };
    case 'ADD_SAVED_FILTER':
      return { ...state, savedFilters: [...state.savedFilters, action.filter] };
    case 'UPDATE_SAVED_FILTER':
      return {
        ...state,
        savedFilters: state.savedFilters.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)),
      };
    case 'DELETE_SAVED_FILTER': {
      // Soft, like every synced record, so other devices learn it is gone.
      const now = new Date().toISOString();
      return {
        ...state,
        savedFilters: state.savedFilters.map((f) => (f.id === action.id ? { ...f, deletedAt: now } : f)),
      };
    }
    case 'SET_TOKEN':
      // Signing back in as the same person: everything already here stays.
      return { ...state, token: action.token };
    case 'CONNECT':
      // Server data arrives via sync; nothing is seeded locally.
      return {
        ...state,
        mode: 'server',
        serverUrl: action.serverUrl,
        token: action.token,
        tasks: [],
        lists: [],
        folders: [],
        viewPrefs: [],
        savedFilters: [],
      };
    case 'USE_SAMPLE_DATA':
      return { ...state, mode: 'sample', serverUrl: '', token: '', viewPrefs: [], savedFilters: [], ...action.data };
    case 'DISCONNECT':
      return {
        ...state,
        mode: 'none',
        serverUrl: '',
        token: '',
        tasks: [],
        lists: [],
        folders: [],
        viewPrefs: [],
        savedFilters: [],
      };
    case 'HYDRATE':
      return {
        ...state,
        tasks: action.tasks,
        lists: action.lists,
        folders: action.folders,
        viewPrefs: action.viewPrefs,
        savedFilters: action.savedFilters,
      };
    case 'MERGE': {
      const tasks = dropRemoved(mergeBatch(state.tasks, action.tasks, action.dirtyIds), action.removed?.tasks ?? []);
      const lists = dropRemoved(mergeBatch(state.lists, action.lists, action.dirtyIds), action.removed?.lists ?? []);
      const folders = mergeBatch(state.folders, action.folders, action.dirtyIds);
      const viewPrefs = mergeBatch(state.viewPrefs, action.viewPrefs, action.dirtyIds);
      const savedFilters = mergeBatch(state.savedFilters, action.savedFilters, action.dirtyIds);
      // Most pulls come back empty. Handing back the same state lets React bail
      // out, instead of re-rendering every consumer on each idle sync tick.
      if (
        tasks === state.tasks &&
        lists === state.lists &&
        folders === state.folders &&
        viewPrefs === state.viewPrefs &&
        savedFilters === state.savedFilters
      ) {
        return state;
      }
      return { ...state, tasks, lists, folders, viewPrefs, savedFilters };
    }
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
export function reduceTaskState(state: State, action: Action): State {
  const next = applyAction(state, action);
  if (next === state) return next;
  // Rows from the server already carry their true updatedAt; restamping them
  // here would make every pull look like a fresh local edit. COMPLETE_AT is
  // exempt for the same reason in reverse — it sets the timestamp deliberately,
  // to the moment the notification was actually tapped.
  if (action.type === 'HYDRATE' || action.type === 'MERGE' || action.type === 'COMPLETE_AT') return next;

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
    viewPrefs: stamp(state.viewPrefs, next.viewPrefs),
    savedFilters: stamp(state.savedFilters, next.savedFilters),
  };
}

function initState(): State {
  const mode = loadMode();
  // Sample data is rebuilt rather than restored, so its dates stay relative to
  // today. Server data rehydrates from the last local snapshot, then sync catches
  // it up in the background.
  const cached = mode === 'server' ? loadServerSnapshot() : null;
  const seeded =
    mode === 'sample'
      ? { ...buildSampleData(new Date()), viewPrefs: [], savedFilters: [] }
      : {
          tasks: cached?.tasks ?? [],
          lists: cached?.lists ?? [],
          folders: cached?.folders ?? [],
          viewPrefs: cached?.viewPrefs ?? [],
          savedFilters: cached?.savedFilters ?? [],
        };
  return {
    ...seeded,
    mode,
    serverUrl: mode === 'server' ? loadServerUrl() : '',
    token: mode === 'server' ? loadToken() : '',
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
  /**
   * The composer sets these two from its buttons rather than from typed tokens,
   * so unlike the fields above they can arrive without any text expressing them.
   */
  dueTime?: string;
  priority?: Priority;
}

/** The most recent completion or trashing, offered for undo until it times out. */
export interface PendingUndo {
  kind: 'complete' | 'delete';
  /**
   * A repeating task that rolled on: the series as it was, and the completed
   * copy left behind. Undo puts the first back and trashes the second.
   */
  repeat?: { before: Task; occurrenceId: string };
  /** One for a completion; for a trashing, every task the toast would put back. */
  taskIds: string[];
  title: string;
  /** Distinguishes repeat actions on the same task so the toast re-animates. */
  token: number;
}

export const UNDO_TIMEOUT_MS = 5000;

/** How often a foregrounded client syncs. */
export const ACTIVE_SYNC_MS = 5000;
/**
 * How often a backgrounded one does. Long, because nobody is watching — and on a
 * phone the difference is battery. Foregrounding syncs immediately regardless,
 * so this delay is never what you wait through when you pick a device up.
 */
export const IDLE_SYNC_MS = 60000;
/**
 * How often a connected client re-probes `/health` for the server's feature
 * list. Long, because that answer only changes when the server is redeployed,
 * and the sync loop itself runs every few seconds.
 */
export const FEATURE_PROBE_MS = 300000;

interface TaskContextValue {
  state: State;
  /** True when the current local mode/server supports an optional feature. */
  supportsFeature: (feature: ServerFeature) => boolean;
  /** The signed-in person and their household, when the server has households. */
  household: Household | null;
  /** Re-reads the household now — after inviting or removing someone. */
  refreshHousehold: () => Promise<void>;
  /** Shares a list with everyone in the household, or makes it private again. Owner only. */
  setListShared: (listId: string, shared: boolean) => void;
  addTaskFromQuickAdd: (text: string, defaults?: QuickAddDefaults) => void;
  toggleComplete: (id: string) => void;
  /** Moves a repeating task to its next date without completing this one. */
  skipOccurrence: (id: string) => void;
  /** Complete a task as of a past moment — a notification action taken while
   * the app was not running. No-op if the task moved on since. */
  completeAt: (id: string, at: string) => void;
  /** Reverses whatever the undo toast is offering. */
  undo: () => void;
  dismissUndo: () => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  /** Prevent this task from being pushed while its detail editor is active. */
  beginTaskEdit: (id: string) => void;
  /** Release one editor hold and schedule the final dirty snapshot to sync. */
  endTaskEdit: (id: string) => void;
  deleteTasks: (ids: string[]) => void;
  restoreTasks: (ids: string[]) => void;
  purgeTasks: (ids: string[]) => void;
  bulkUpdate: (ids: string[], patch: Partial<Task>) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  /** Due today. */
  scheduleToday: (id: string) => void;
  /** Due tomorrow. */
  snoozeTask: (id: string) => void;
  /** `ids` is the visible slice in its new order. */
  reorderTasks: (ids: string[], prevId: string | null, nextId: string | null) => void;
  setArrangement: (key: string, sortBy: SortBy, groupKey: string, ids: string[]) => void;
  clearArrangement: (key: string, sortBy: SortBy) => void;
  /** `folderId` is the destination — null for the root, alongside the folders. */
  reorderList: (id: string, folderId: string | null, prevId: string | null, nextId: string | null) => void;
  reorderFolder: (id: string, prevId: string | null, nextId: string | null) => void;
  /** `folderId` null puts the list at the root, beside the folders. */
  addList: (name: string, folderId: string | null) => void;
  addFolder: (name: string) => void;
  setListColor: (listId: string, color: string) => void;
  renameList: (listId: string, name: string) => void;
  renameFolder: (folderId: string, name: string) => void;
  /**
   * Soft-deletes the list; its tasks fall back to Inbox rather than being lost.
   * Only the list's owner may; for anyone else this does nothing.
   */
  deleteList: (listId: string) => void;
  /** Soft-deletes the folder and its lists; their tasks fall back to Inbox. */
  deleteFolder: (folderId: string) => void;
  getViewOptions: (key: string) => ViewOptions;
  setViewOptions: (key: string, options: ViewOptions) => void;
  /** Keeps a Browse question under a name; appended after the others. */
  addSavedFilter: (name: string, criteria: TaskCriteria) => void;
  updateSavedFilter: (id: string, patch: Partial<Pick<SavedFilter, 'name' | 'criteria'>>) => void;
  deleteSavedFilter: (id: string) => void;
  /** Validates against the server before committing; throws ApiError on failure. */
  connect: (serverUrl: string, token: string) => Promise<void>;
  /**
   * Why the server stopped accepting this device, or null while it does. Set by
   * the sync loop on a 401, which then stops; the data and unsynced edits stay.
   */
  signedOut: SignedOutReason | null;
  /**
   * Sign in with a new token while already connected, or signed out.
   *
   * The same person on the same server keeps everything on this device,
   * unsynced edits included, which then push under the new token. Anyone or
   * anywhere else starts afresh, and when that would drop unsynced edits this
   * resolves `confirm` with how many, unless `discard` says the caller already
   * asked. Throws ApiError when the token doesn't work.
   */
  signInAgain: (
    serverUrl: string,
    token: string,
    options?: { discard?: boolean }
  ) => Promise<{ status: 'done' } | { status: 'confirm'; pending: number }>;
  /** Load the sample dataset and work entirely offline. */
  useSampleData: () => void;
  disconnect: () => void;
  removeSavedServer: (url: string) => void;
  /**
   * Runs a sync cycle now and resolves when it settles, for pull-to-refresh.
   * Joins the cycle already in flight rather than starting a second one, and
   * resolves immediately outside server mode, where there is nothing to sync.
   */
  syncNow: () => Promise<void>;
}

const TaskContext = createContext<TaskContextValue | null>(null);
/**
 * Sync status and the pending undo change on their own clock — the sync status
 * several times a cycle — and only a couple of small components show them. Kept
 * out of `TaskContext` so those changes re-render the indicator and the toast,
 * not every screen that reads tasks.
 */
const SyncStatusContext = createContext<SyncStatus | null>(null);
const PendingUndoContext = createContext<PendingUndo | null>(null);


export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reduceTaskState, undefined, initState);
  // `null` means "not probed yet", which is deliberately not the same as `[]`.
  // A server that answered with no features is one to strip fields for; a server
  // we simply haven't reached is not, because omitting a field it does support
  // would wipe the stored value.
  const [serverFeatures, setServerFeatures] = useState<ServerFeature[] | null>(() => {
    const mode = loadMode();
    return mode === 'server' ? (loadServerSnapshot()?.serverFeatures ?? null) : [...SERVER_FEATURES];
  });
  const [household, setHousehold] = useState<Household | null>(() =>
    loadMode() === 'server' ? (loadServerSnapshot()?.household ?? null) : null
  );
  const householdRef = useRef(household);
  useEffect(() => {
    householdRef.current = household;
  }, [household]);
  const ding = useAudioPlayer(require('../../assets/sounds/ding.wav'));

  // A completion ding should sound even with the phone in silent mode.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  // Ids changed locally since the last successful push. A ref, not state: it's
  // mutated on every edit, and none of that should trigger a re-render.
  const outboxRef = useRef(new Outbox(loadDirtyIds()));
  // Reference-counted because changing layouts can briefly hand one task from
  // the sheet to the wide pane before the old editor has cleaned itself up.
  const taskEditCountsRef = useRef(new Map<string, number>());

  // The sync loop below runs on its own timer, outside React's render cycle, so
  // it reads state through a ref to always see the latest values.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const serverFeaturesRef = useRef(serverFeatures);
  useEffect(() => {
    serverFeaturesRef.current = serverFeatures;
  }, [serverFeatures]);
  /** When /health last answered, so the loop can re-probe on its own schedule. */
  const featuresProbedAtRef = useRef(0);

  // Persisted with the local server snapshot. Undefined means the next pull is a
  // full hydrate, which is still the right answer until a cached collection exists.
  const cursorRef = useRef<string | undefined>(loadServerSnapshot()?.cursor);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'syncing', pending: 0 });
  const [signedOut, setSignedOut] = useState<SignedOutReason | null>(null);

  // The sync loop is created and torn down by the effect below; this is how
  // anything outside it asks for a cycle. Null whenever there is no loop —
  // sample mode, or between teardown and setup.
  const cycleRef = useRef<(() => Promise<void>) | null>(null);

  const beginTaskEdit = useCallback((id: string) => {
    const counts = taskEditCountsRef.current;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }, []);

  const endTaskEdit = useCallback((id: string) => {
    const counts = taskEditCountsRef.current;
    const next = (counts.get(id) ?? 0) - 1;
    if (next > 0) {
      counts.set(id, next);
      return;
    }
    counts.delete(id);
    if (!outboxRef.current.has(id)) return;
    // Draft flushing dispatches just before releasing the hold. Let that React
    // update reach stateRef before asking the sync loop for its final snapshot.
    setTimeout(() => cycleRef.current?.(), 0);
  }, []);

  // Marking dirty updates the indicator immediately, so an edit reads as pending
  // the moment it's made rather than up to a cycle later.
  const markDirty = useCallback((ids: string[]) => {
    outboxRef.current.mark(ids);
    saveDirtyIds(outboxRef.current.toArray());
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
      ? activeLists(state.lists).find((l) => l.name.toLowerCase() === parsed.listName!.toLowerCase())
      : undefined;
    const task: Task = {
      id: newTaskId(),
      title: parsed.title,
      notes: '',
      // 'none' is what the parser returns when no !token was typed, so it reads
      // as "unspecified" here and lets the composer's flag through.
      priority: parsed.priority !== 'none' ? parsed.priority : (defaults?.priority ?? 'none'),
      // A typed date overrides the view's date; tags from both are merged.
      dueDate: parsed.dueDate ?? defaults?.dueDate,
      dueTime: parsed.dueTime ?? defaults?.dueTime,
      reminders: [],
      // Only where the server can keep it — an "every …" typed against one
      // that can't stays a one-off task on its first date.
      ...(parsed.repeat && (state.mode !== 'server' || hasServerFeature(serverFeatures ?? [], 'taskRepeat'))
        ? { repeat: parsed.repeat }
        : {}),
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
  }, [state.lists, state.mode, serverFeatures, markDirty]);

  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);

  // Only completing offers an undo — un-completing is already its own undo.
  const toggleComplete = useCallback(
    (id: string) => {
      const task = state.tasks.find((t) => t.id === id);
      const at = new Date().toISOString();
      // Worked out here as well as in the reducer — the same pure function on
      // the same row and moment — so the completed copy can be marked dirty and
      // offered for undo.
      const rolled = task ? completeRepeating(task, at, toISODate(new Date(at))) : null;
      dispatch({ type: 'TOGGLE_COMPLETE', id, at });
      markDirty(rolled ? [id, rolled.occurrence.id] : [id]);
      if (task && !task.completed) {
        ding.pause();
        ding.seekTo(0).then(() => ding.play());
      }
      setPendingUndo(
        task && !task.completed
          ? {
              kind: 'complete',
              taskIds: [id],
              title: task.title,
              token: Date.now(),
              ...(rolled ? { repeat: { before: task, occurrenceId: rolled.occurrence.id } } : {}),
            }
          : null
      );
    },
    [state.tasks, ding, markDirty]
  );

  const skipOccurrence = useCallback(
    (id: string) => {
      dispatch({ type: 'SKIP_OCCURRENCE', id, at: new Date().toISOString() });
      markDirty([id]);
    },
    [markDirty]
  );

  /**
   * Folds a "Mark done" taken on a notification into app state.
   *
   * No sound and no undo toast, unlike toggleComplete: by the time this runs the
   * tap may be hours old and the user is not necessarily looking at the app.
   * Marking dirty is what carries it to the server on the next push — harmless
   * when the native handler already got it there, since the row is identical and
   * the server's own last-write-wins makes the repeat a no-op.
   */
  const completeAt = useCallback(
    (id: string, at: string) => {
      const task = stateRef.current.tasks.find((t) => t.id === id);
      // A missing task, a stale notification, or a duplicate completion cannot
      // change state. Keeping it out of the outbox matters: pushDirty cannot
      // clear an id for which no local row exists, leaving sync pending forever.
      if (!task || task.completed || task.updatedAt >= at) return;
      const rolled = completeRepeating(task, at, toISODate(new Date(at)));
      dispatch({ type: 'COMPLETE_AT', id, at });
      markDirty(rolled ? [id, rolled.occurrence.id] : [id]);
    },
    [markDirty]
  );

  const dismissUndo = useCallback(() => setPendingUndo(null), []);

  const undo = useCallback(() => {
    setPendingUndo((current) => {
      if (current?.kind === 'complete' && current.repeat) {
        // The series back where it was, and the completed copy into the trash.
        const before = current.repeat.before;
        dispatch({
          type: 'UPDATE_TASK',
          id: before.id,
          patch: { dueDate: before.dueDate, repeat: before.repeat, subtasks: before.subtasks, completed: false, completedAt: undefined },
        });
        dispatch({ type: 'DELETE_TASKS', ids: [current.repeat.occurrenceId] });
        markDirty([before.id, current.repeat.occurrenceId]);
      } else if (current?.kind === 'complete') {
        // Set the flag directly rather than toggling, so this stays correct even if
        // the task was un-completed by other means in the meantime.
        dispatch({ type: 'UPDATE_TASK', id: current.taskIds[0], patch: { completed: false, completedAt: undefined } });
        markDirty(current.taskIds);
      } else if (current?.kind === 'delete') {
        dispatch({ type: 'RESTORE_TASKS', ids: current.taskIds });
        markDirty(current.taskIds);
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
  // Every way into the trash offers its undo — the menu, the list's Delete key,
  // a swipe, the bulk bar. Trashings in quick succession (Delete held down, or
  // pressed down a list) gather into one undo, so it never puts back only the
  // last of a run. Tasks already in the trash aren't this action's to restore.
  const deleteTasks = useCallback(
    (ids: string[]) => {
      const live = ids.filter((id) => state.tasks.some((t) => t.id === id && !t.deletedAt));
      dispatch({ type: 'DELETE_TASKS', ids });
      markDirty(ids);
      if (live.length === 0) return;
      setPendingUndo((current) => {
        const taskIds = current?.kind === 'delete' ? [...new Set([...current.taskIds, ...live])] : live;
        const only = taskIds.length === 1 ? state.tasks.find((t) => t.id === taskIds[0]) : undefined;
        const title = only ? only.title.trim() || 'Untitled task' : `${taskIds.length} tasks`;
        return { kind: 'delete', taskIds, title, token: Date.now() };
      });
    },
    [state.tasks, markDirty]
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
  const scheduleToday = useCallback(
    (id: string) => {
      dispatch({ type: 'SET_DUE_DAY', id, days: 0 });
      markDirty([id]);
    },
    [markDirty]
  );
  const snoozeTask = useCallback(
    (id: string) => {
      dispatch({ type: 'SET_DUE_DAY', id, days: 1 });
      markDirty([id]);
    },
    [markDirty]
  );
  // The usual midpoint changes one task. When a gap runs out of precision,
  // computeOrders respaces a local window around it. Compute against the same
  // render-time snapshot that supplied prevId/nextId, then give one change map
  // to both the reducer and outbox so their affected rows cannot drift apart.
  const reorderTasks = useCallback(
    (ids: string[], prevId: string | null, nextId: string | null) => {
      const orders = changedOrders(state.tasks, computeOrders(state.tasks, ids, prevId, nextId));
      if (orders.size === 0) return;
      dispatch({ type: 'REORDER_TASKS', orders });
      markDirty([...orders.keys()]);
    },
    [state.tasks, markDirty]
  );
  // An arrangement lives entirely on the view, so no task is dirtied here. That is
  // the whole point: reordering under a sort must not disturb the Custom order.
  const setArrangement = useCallback(
    (key: string, sortBy: SortBy, groupKey: string, ids: string[]) => {
      dispatch({ type: 'SET_ARRANGEMENT', key, sortBy, groupKey, ids });
      markDirty([key]);
    },
    [markDirty]
  );
  const clearArrangement = useCallback(
    (key: string, sortBy: SortBy) => {
      dispatch({ type: 'CLEAR_ARRANGEMENT', key, sortBy });
      markDirty([key]);
    },
    [markDirty]
  );
  /**
   * Moves a list within its folder, or into another one.
   *
   * `markDirty` covers the whole affected scope. Container moves can change both
   * folder membership and order across two collections, and their scopes are
   * single digits, so marking the lot is simpler and cheap.
   */
  const reorderList = useCallback(
    (id: string, folderId: string | null, prevId: string | null, nextId: string | null) => {
      const list = state.lists.find((l) => l.id === id);
      dispatch({ type: 'REORDER_LIST', id, folderId, prevId, nextId });
      // Both folders on a cross-folder move: the one it left has to be respaced
      // and pushed too.
      const touched = state.lists.filter(
        (l) => !l.deletedAt && (l.folderId === folderId || l.folderId === list?.folderId)
      );
      // A drop at the root can respace the folders as well, since they share
      // that run of positions.
      const roots =
        folderId === null || list?.folderId === null
          ? activeFolders(state.folders).map((f) => f.id)
          : [];
      markDirty([id, ...touched.map((l) => l.id), ...roots]);
    },
    [state.lists, markDirty]
  );
  const reorderFolder = useCallback(
    (id: string, prevId: string | null, nextId: string | null) => {
      dispatch({ type: 'REORDER_FOLDER', id, prevId, nextId });
      markDirty([id, ...rootScope(state.folders, state.lists).map((r) => r.id)]);
    },
    [state.folders, state.lists, markDirty]
  );
  /**
   * Appended, not prepended.
   *
   * Tasks are created with `order: -Date.now()` so the newest lands on top —
   * right for a quick-add field you type into all day. A list is made
   * deliberately, almost always from the `+` on a particular folder heading,
   * and you expect it to appear where you pressed: at the end of that folder.
   */
  const addList = useCallback(
    (name: string, folderId: string | null) => {
      // At the root the siblings include the folders, since they share that run
      // of positions.
      const siblings: Ordered[] =
        folderId === null
          ? rootScope(state.folders, state.lists)
          : state.lists.filter((l) => l.folderId === folderId && !l.deletedAt);
      const list = {
        id: newListId(),
        name,
        folderId,
        color: LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)],
        order: siblings.length ? Math.max(...siblings.map((l) => l.order)) + 1 : 0,
        updatedAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_LIST', list });
      markDirty([list.id]);
    },
    [state.lists, state.folders, markDirty]
  );
  const setListColor = useCallback(
    (listId: string, color: string) => {
      dispatch({ type: 'UPDATE_LIST', id: listId, patch: { color } });
      markDirty([listId]);
    },
    [markDirty]
  );
  const setListShared = useCallback(
    (listId: string, shared: boolean) => {
      const list = state.lists.find((l) => l.id === listId);
      if (!list || !ownsList(list, household)) return;
      dispatch({ type: 'UPDATE_LIST', id: listId, patch: { shared } });
      markDirty([listId]);
    },
    [state.lists, household, markDirty]
  );
  const renameList = useCallback(
    (listId: string, name: string) => {
      dispatch({ type: 'UPDATE_LIST', id: listId, patch: { name } });
      markDirty([listId]);
    },
    [markDirty]
  );
  const renameFolder = useCallback(
    (folderId: string, name: string) => {
      dispatch({ type: 'UPDATE_FOLDER', id: folderId, patch: { name } });
      markDirty([folderId]);
    },
    [markDirty]
  );
  // The tasks being moved to Inbox are edits in their own right, so they have to
  // be marked dirty too — otherwise the list deletion would sync while the tasks
  // stayed pointing at it on every other device.
  const deleteList = useCallback(
    (listId: string) => {
      // The server refuses it too; stopping here keeps the tasks from being
      // moved into this person's Inbox on the way to a refusal.
      const list = state.lists.find((l) => l.id === listId);
      if (list && !ownsList(list, household)) return;
      const moved = state.tasks.filter((t) => t.listId === listId).map((t) => t.id);
      const prefs = viewPrefIdsForLists(state.viewPrefs, [listId]);
      dispatch({ type: 'DELETE_LIST', id: listId });
      markDirty([listId, ...moved, ...prefs]);
    },
    [state.lists, state.tasks, state.viewPrefs, household, markDirty]
  );
  const deleteFolder = useCallback(
    (folderId: string) => {
      const doomed = state.lists.filter((l) => l.folderId === folderId && !l.deletedAt).map((l) => l.id);
      const moved = state.tasks.filter((t) => t.listId && doomed.includes(t.listId)).map((t) => t.id);
      const prefs = viewPrefIdsForLists(state.viewPrefs, doomed);
      dispatch({ type: 'DELETE_FOLDER', id: folderId });
      markDirty([folderId, ...doomed, ...moved, ...prefs]);
    },
    [state.lists, state.tasks, state.viewPrefs, markDirty]
  );
  /** Appended for the same reason as `addList`, over the whole folder list. */
  const addFolder = useCallback(
    (name: string) => {
      const siblings = rootScope(state.folders, state.lists);
      const folder = {
        id: newFolderId(),
        name,
        order: siblings.length ? Math.max(...siblings.map((f) => f.order)) + 1 : 0,
        updatedAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_FOLDER', folder });
      markDirty([folder.id]);
    },
    [state.folders, state.lists, markDirty]
  );
  const getViewOptions = useCallback(
    (key: string) => viewOptionsFor(state.viewPrefs, key),
    [state.viewPrefs]
  );
  const setViewOptions = useCallback(
    (key: string, options: ViewOptions) => {
      dispatch({ type: 'SET_VIEW_OPTIONS', key, options });
      markDirty([key]);
    },
    [markDirty]
  );
  const addSavedFilter = useCallback(
    (name: string, criteria: TaskCriteria) => {
      const live = state.savedFilters.filter((f) => !f.deletedAt);
      const filter: SavedFilter = {
        id: newSavedFilterId(),
        name,
        criteria,
        order: live.length ? Math.max(...live.map((f) => f.order)) + 1 : 0,
        updatedAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_SAVED_FILTER', filter });
      markDirty([filter.id]);
    },
    [state.savedFilters, markDirty]
  );
  const updateSavedFilter = useCallback(
    (id: string, patch: Partial<Pick<SavedFilter, 'name' | 'criteria'>>) => {
      dispatch({ type: 'UPDATE_SAVED_FILTER', id, patch });
      markDirty([id]);
    },
    [markDirty]
  );
  const deleteSavedFilter = useCallback(
    (id: string) => {
      dispatch({ type: 'DELETE_SAVED_FILTER', id });
      markDirty([id]);
    },
    [markDirty]
  );
  const connect = useCallback(async (serverUrl: string, token: string) => {
    const url = serverUrl.replace(/\/+$/, '');
    const api = createApi(url, token);
    // A probe that fails leaves this null: unknown, to be resolved by the sync
    // loop, rather than an assertion that the server supports nothing.
    const info = await api.health();
    // A full hydrate doubles as validation: a bad URL or token throws ApiError
    // here, before anything is persisted or the UI leaves FirstRun.
    const batch = await api.pull(undefined);
    // Best-effort: a sign-in that worked should not fail over the household,
    // and the sync loop asks again.
    const who = info?.features.includes('household') ? await api.me().catch(() => null) : null;

    saveServerUrl(url);
    saveToken(token);
    saveMode('server');
    addSavedServer(url, token);
    cursorRef.current = batch.now;
    outboxRef.current = new Outbox();
    clearDirtyIds();
    featuresProbedAtRef.current = info ? Date.now() : 0;
    setServerFeatures(info?.features ?? null);
    setHousehold(who ? householdFrom(who) : null);

    setSignedOut(null);
    dispatch({ type: 'CONNECT', serverUrl: url, token });
    dispatch({
      type: 'HYDRATE',
      tasks: batch.tasks,
      lists: batch.lists,
      folders: batch.folders,
      viewPrefs: batch.viewPrefs,
      savedFilters: batch.savedFilters,
    });
  }, []);
  const useSampleData = useCallback(() => {
    clearServerUrl();
    clearToken();
    cursorRef.current = undefined;
    clearServerSnapshot();
    clearDirtyIds();
    saveMode('sample');
    setServerFeatures([...SERVER_FEATURES]);
    setHousehold(null);
    setSignedOut(null);
    dispatch({ type: 'USE_SAMPLE_DATA', data: buildSampleData(new Date()) });
  }, []);
  const disconnect = useCallback(() => {
    clearServerUrl();
    clearToken();
    cursorRef.current = undefined;
    clearServerSnapshot();
    clearDirtyIds();
    saveMode('none');
    setServerFeatures([...SERVER_FEATURES]);
    setHousehold(null);
    setSignedOut(null);
    dispatch({ type: 'DISCONNECT' });
  }, []);
  const signInAgain = useCallback<TaskContextValue['signInAgain']>(
    async (serverUrl, token, options) => {
      const url = serverUrl.replace(/\/+$/, '');
      const current = stateRef.current;
      if (current.mode === 'server' && current.serverUrl === url) {
        const api = createApi(url, token);
        const info = await api.health();
        // A server without households has one person, so any working token
        // there is the same person. Otherwise, ask it who this token is.
        const who = info?.features.includes('household') ? await api.me() : null;
        if (!who) await api.pull(new Date().toISOString());
        // Nobody cached (an env-token sign-in before households) can't be
        // told apart from the new person, so it counts as the same.
        const before = householdRef.current?.me?.id;
        if (!who || before === undefined || who.member?.id === before) {
          saveToken(token);
          addSavedServer(url, token);
          if (who) setHousehold(householdFrom(who));
          setSignedOut(null);
          dispatch({ type: 'SET_TOKEN', token });
          return { status: 'done' };
        }
      }
      const pending = outboxRef.current.size;
      if (pending > 0 && !options?.discard) return { status: 'confirm', pending };
      await connect(url, token);
      return { status: 'done' };
    },
    [connect]
  );
  const removeSavedServer = useCallback((url: string) => {
    removeSavedServerStorage(url);
  }, []);

  // Push dirty records, then pull. Runs once on connect, again whenever the app
  // comes to the foreground, and on a timer in between; a change mid-cycle waits
  // for the next tick rather than firing its own request, which keeps concurrent
  // pushes from racing each other.
  useEffect(() => {
    if (state.mode !== 'server') return;
    const api = createApi(state.serverUrl, state.token);
    let cancelled = false;
    /** Set once the server refuses this token. */
    let stopped = false;
    let inFlight: Promise<void> | null = null;
    let timer: ReturnType<typeof setTimeout>;

    /**
     * Polling every few seconds forever is wasted work when nobody is looking —
     * and on a phone it's wasted battery. Backgrounded clients fall back to a
     * slow tick, *unless* there are unsent edits: those shouldn't wait a minute
     * to reach the server just because the user switched away right after making
     * them.
     */
    const nextDelay = (): number => {
      const foreground = AppState.currentState === 'active';
      if (foreground || outboxRef.current.size > 0) return ACTIVE_SYNC_MS;
      return IDLE_SYNC_MS;
    };

    const run = async () => {
      setSyncStatus((s) => (s.state === 'syncing' ? s : { ...s, state: 'syncing' }));
      try {
        // Re-probe only when the answer is unknown or stale — a feature list that
        // changes on redeploy does not need fetching every few seconds.
        let features = serverFeaturesRef.current;
        if (features === null || Date.now() - featuresProbedAtRef.current >= FEATURE_PROBE_MS) {
          const info = await api.health();
          // Who is in the household changes about as rarely as the feature list,
          // so it rides the same slow timer. A failure keeps what was known.
          if (info?.features.includes('household')) {
            const who = await api.me().catch(() => null);
            if (who) setHousehold(householdFrom(who));
          } else if (info) {
            setHousehold(null);
          }
          if (info) {
            const next = info.features;
            featuresProbedAtRef.current = Date.now();
            features = next;
            // Written straight through, not just queued: the push below reads the
            // ref, and setState would not land until after the next render.
            // Pushing a stale answer is exactly what strips a supported field.
            serverFeaturesRef.current = next;
            setServerFeatures((current) =>
              current && current.length === next.length && current.every((feature) => next.includes(feature))
                ? current
                : next
            );
          }
        }
        if (outboxRef.current.size > 0) {
          const pushed = await pushDirty(
            api,
            outboxRef.current,
            stateRef.current,
            new Set(taskEditCountsRef.current.keys()),
            // Unknown means send everything; only a server that answered gets fields stripped.
            features ?? SERVER_FEATURES
          );
          saveDirtyIds(outboxRef.current.toArray());
          if (pushed) {
            dispatch({
              type: 'MERGE',
              dirtyIds: outboxRef.current.snapshot(),
              tasks: pushed.tasks,
              lists: pushed.lists,
              folders: pushed.folders,
              viewPrefs: pushed.viewPrefs,
              savedFilters: pushed.savedFilters,
            });
          }
        }
        const pulled = await pullSince(api, cursorRef.current);
        cursorRef.current = pulled.now;
        const removedIds = [...pulled.removed.tasks, ...pulled.removed.lists];
        if (removedIds.length > 0) {
          outboxRef.current.clear(removedIds);
          saveDirtyIds(outboxRef.current.toArray());
        }
        dispatch({
          type: 'MERGE',
          dirtyIds: outboxRef.current.snapshot(),
          tasks: pulled.tasks,
          lists: pulled.lists,
          folders: pulled.folders,
          viewPrefs: pulled.viewPrefs,
          savedFilters: pulled.savedFilters,
          removed: pulled.removed,
        });

        // The state effect below persists the merged collections and this cursor
        // together. Saving here would pair the new cursor with stateRef's
        // pre-merge rows; if the app died before React committed the MERGE, the
        // next launch would resume after changes its snapshot never contained.
        // Leaving the previous snapshot untouched in that window is safe: an
        // interrupted launch simply replays this pull.

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
        const reason = signedOutReason(err);
        setSyncStatus((s) => ({
          ...s,
          state: reason ? 'unauthorized' : 'offline',
          pending: outboxRef.current.size,
        }));
        if (reason) {
          // Retrying a refused token only repeats the refusal. The loop stays
          // down until a new token restarts it.
          stopped = true;
          setSignedOut(reason);
        }
      }
      if (!cancelled && !stopped) timer = setTimeout(cycle, nextDelay());
    };

    /**
     * Foregrounding and pull-to-refresh both fire a cycle whenever they like, so
     * one already running is joined rather than doubled — a puller gets the
     * spinner until the real work settles either way.
     */
    const cycle = (): Promise<void> => {
      if (cancelled || stopped) return Promise.resolve();
      if (!inFlight) {
        // The run re-arms the timer when it settles, so a cycle asked for early
        // replaces the pending tick instead of being chased by it.
        clearTimeout(timer);
        inFlight = run().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    };

    cycleRef.current = cycle;

    // The moment you look at a device is exactly when staleness is visible, so
    // don't wait out the timer — sync straight away.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || cancelled) return;
      cycle();
    });

    cycle();
    return () => {
      cancelled = true;
      cycleRef.current = null;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [state.mode, state.serverUrl, state.token]);

  /**
   * Keeps the native notification handler's copy of the connection current.
   *
   * It cannot read this from AsyncStorage — that is React Native's own on-disk
   * format on iOS, and reaching into it from Swift would bind the handler to an
   * implementation detail. Clearing on disconnect matters as much as setting:
   * a stale token left behind would have a notification tap posting a completed
   * task to a server the user has since walked away from.
   */
  useEffect(() => {
    if (state.mode === 'server') setNativeCredentials(state.serverUrl, state.token);
    else setNativeCredentials(null, null);
  }, [state.mode, state.serverUrl, state.token]);

  useEffect(() => {
    if (state.mode !== 'server') return;
    saveServerSnapshot({
      tasks: state.tasks,
      lists: state.lists,
      folders: state.folders,
      viewPrefs: state.viewPrefs,
      savedFilters: state.savedFilters,
      serverFeatures: serverFeatures ?? undefined,
      household: household ?? undefined,
      cursor: cursorRef.current,
    });
  }, [
    state.mode,
    state.tasks,
    state.lists,
    state.folders,
    state.viewPrefs,
    state.savedFilters,
    serverFeatures,
    household,
  ]);

  const syncNow = useCallback(() => cycleRef.current?.() ?? Promise.resolve(), []);
  const refreshHousehold = useCallback(async () => {
    if (state.mode !== 'server') return;
    const who = await createApi(state.serverUrl, state.token).me().catch(() => null);
    if (who) setHousehold(householdFrom(who));
  }, [state.mode, state.serverUrl, state.token]);
  // Only against a server that has said it keeps households: an answer cached
  // from before it was downgraded must not keep offering sharing.
  const visibleHousehold = state.mode === 'server' && hasServerFeature(serverFeatures ?? [], 'household') ? household : null;
  // Two questions, two opposite safe answers. Offering a capability we have not
  // confirmed is merely wrong on screen and fixes itself on the next probe, so an
  // unknown server hides it. Stripping a field off a push is *not* recoverable —
  // the upsert replaces the row — so an unknown server is still sent everything.
  const supportsFeature = useCallback(
    (feature: ServerFeature) => state.mode !== 'server' || hasServerFeature(serverFeatures ?? [], feature),
    [state.mode, serverFeatures]
  );

  const value = useMemo<TaskContextValue>(
    () => ({
      state,
      supportsFeature,
      household: visibleHousehold,
      refreshHousehold,
      setListShared,
      addTaskFromQuickAdd,
      toggleComplete,
      skipOccurrence,
      completeAt,
      undo,
      dismissUndo,
      updateTask,
      beginTaskEdit,
      endTaskEdit,
      deleteTasks,
      restoreTasks,
      purgeTasks,
      bulkUpdate,
      addSubtask,
      toggleSubtask,
      scheduleToday,
      snoozeTask,
      reorderTasks,
      setArrangement,
      clearArrangement,
      reorderList,
      reorderFolder,
      addList,
      addFolder,
      setListColor,
      renameList,
      renameFolder,
      deleteList,
      deleteFolder,
      getViewOptions,
      setViewOptions,
      addSavedFilter,
      updateSavedFilter,
      deleteSavedFilter,
      connect,
      signedOut,
      signInAgain,
      useSampleData,
      disconnect,
      removeSavedServer,
      syncNow,
    }),
    [
      state,
      supportsFeature,
      visibleHousehold,
      refreshHousehold,
      setListShared,
      addTaskFromQuickAdd,
      toggleComplete,
      skipOccurrence,
      completeAt,
      undo,
      dismissUndo,
      updateTask,
      beginTaskEdit,
      endTaskEdit,
      deleteTasks,
      restoreTasks,
      purgeTasks,
      bulkUpdate,
      addSubtask,
      toggleSubtask,
      scheduleToday,
      snoozeTask,
      reorderTasks,
      setArrangement,
      clearArrangement,
      reorderList,
      reorderFolder,
      addList,
      addFolder,
      setListColor,
      renameList,
      renameFolder,
      deleteList,
      deleteFolder,
      getViewOptions,
      setViewOptions,
      addSavedFilter,
      updateSavedFilter,
      deleteSavedFilter,
      connect,
      signedOut,
      signInAgain,
      useSampleData,
      disconnect,
      removeSavedServer,
      syncNow,
    ]
  );

  return (
    <TaskContext.Provider value={value}>
      <SyncStatusContext.Provider value={syncStatus}>
        <PendingUndoContext.Provider value={pendingUndo}>{children}</PendingUndoContext.Provider>
      </SyncStatusContext.Provider>
    </TaskContext.Provider>
  );
}

export function useTasks(): TaskContextValue {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTasks must be used within a TaskProvider');
  return ctx;
}

/** Live sync state, for the sync indicator. Only meaningful in server mode. */
export function useSyncStatus(): SyncStatus {
  const status = useContext(SyncStatusContext);
  if (!status) throw new Error('useSyncStatus must be used within a TaskProvider');
  return status;
}

/** The completion the undo toast is offering to reverse, if any. */
export function usePendingUndo(): PendingUndo | null {
  return useContext(PendingUndoContext);
}

import { Api, ApiError, SyncBatch } from './api';
import { FolderDef, ListDef, SERVER_FEATURES, SavedFilter, ServerFeature, Task, ViewPref } from './types';

export { ApiError };

export type SyncState =
  /** Everything local has reached the server. */
  | 'synced'
  /** A push or pull is in flight. */
  | 'syncing'
  /** Local edits are queued, waiting for the next cycle. */
  | 'pending'
  /** The last cycle couldn't reach the server. Edits stay queued. */
  | 'offline'
  /** The server rejected the token — this one won't fix itself. */
  | 'unauthorized';

export interface SyncStatus {
  state: SyncState;
  /** Records changed locally that haven't reached the server yet. */
  pending: number;
  /** ISO timestamp of the last cycle that completed without error. */
  lastSyncedAt?: string;
}

/**
 * Tracks record ids changed locally since the last successful push, so push()
 * sends only what's dirty and merge() knows which incoming rows to defer to
 * a not-yet-pushed local edit.
 */
export class Outbox {
  private ids = new Set<string>();

  constructor(ids: string[] = []) {
    this.mark(ids);
  }

  mark(ids: string[]): void {
    for (const id of ids) this.ids.add(id);
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  get size(): number {
    return this.ids.size;
  }

  /** Removes ids that were included in a push that succeeded. */
  clear(ids: string[]): void {
    for (const id of ids) this.ids.delete(id);
  }

  /** A point-in-time copy, safe to hand to a reducer action. */
  snapshot(): Set<string> {
    return new Set(this.ids);
  }

  /** A JSON-friendly copy for persistence. */
  toArray(): string[] {
    return Array.from(this.ids);
  }
}

interface Collections {
  tasks: Task[];
  lists: ListDef[];
  folders: FolderDef[];
  viewPrefs: ViewPref[];
  savedFilters: SavedFilter[];
}

export function hasServerFeature(features: readonly ServerFeature[], feature: ServerFeature): boolean {
  return features.includes(feature);
}

/**
 * Drops fields the connected backend cannot persist. The asymmetry matters:
 * `POST /sync` upserts whole rows, so omitting a field a server *does* support
 * erases the stored value, while a field an older server has never heard of is
 * simply ignored. Strip only what /health has actually disclaimed — when the
 * feature set is unknown, callers should pass every feature rather than none.
 */
function taskForFeatures(task: Task, features: readonly ServerFeature[]): Task {
  let out = task;
  if (!hasServerFeature(features, 'taskReminders')) {
    const { reminders: _unsupported, ...compatible } = out;
    out = compatible;
  }
  if (!hasServerFeature(features, 'household')) {
    const { assigneeId: _unsupported, ...compatible } = out;
    out = compatible;
  }
  return out;
}

/** `ownerId` is the server's to set, so it never goes back up either way. */
function listForFeatures(list: ListDef, features: readonly ServerFeature[]): ListDef {
  const { ownerId: _serverSet, ...rest } = list;
  if (hasServerFeature(features, 'household')) return rest;
  const { shared: _unsupported, ...compatible } = rest;
  return compatible;
}

/**
 * Sends every dirty record except tasks whose detail editor is still open.
 * Held tasks remain in the outbox, so pulls cannot overwrite them and the next
 * push sends their latest snapshot once the edit session ends.
 */
export async function pushDirty(
  api: Api,
  outbox: Outbox,
  state: Collections,
  heldTaskIds: ReadonlySet<string> = new Set(),
  supportedFeatures: readonly ServerFeature[] = SERVER_FEATURES
): Promise<SyncBatch | null> {
  const tasks = state.tasks
    .filter((t) => outbox.has(t.id) && !heldTaskIds.has(t.id))
    .map((task) => taskForFeatures(task, supportedFeatures));
  const lists = state.lists.filter((l) => outbox.has(l.id)).map((list) => listForFeatures(list, supportedFeatures));
  const folders = state.folders.filter((f) => outbox.has(f.id));
  const viewPrefs = state.viewPrefs.filter((v) => outbox.has(v.id));
  const savedFilters = state.savedFilters.filter((f) => outbox.has(f.id));
  // A whole collection rather than a field, so there is no row for an older
  // server to overwrite: it would ignore the key. It is left off anyway when the
  // server has said it cannot keep them, and cleared from the outbox with the
  // rest, since there is no later push that could succeed where this one didn't.
  const sendFilters = hasServerFeature(supportedFeatures, 'savedFilters');

  if (tasks.length + lists.length + folders.length + viewPrefs.length + savedFilters.length === 0) return null;

  const result = await api.push({
    tasks,
    lists,
    folders,
    viewPrefs,
    ...(sendFilters && savedFilters.length > 0 ? { savedFilters } : {}),
  });
  outbox.clear([
    ...tasks.map((t) => t.id),
    ...lists.map((l) => l.id),
    ...folders.map((f) => f.id),
    ...viewPrefs.map((v) => v.id),
    ...savedFilters.map((f) => f.id),
  ]);
  return result;
}

export async function pullSince(api: Api, since: string | undefined): Promise<SyncBatch> {
  try {
    return await api.pull(since);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // Client was offline longer than the retention window — a hard delete could
      // have happened without a tombstone ever reaching it. Re-hydrate fully.
      return api.pull(undefined);
    }
    throw err;
  }
}

/**
 * Drops rows the server says this person can no longer see.
 *
 * Unlike `mergeBatch`, a pending local edit does not protect a row: the server
 * discards pushes to rows the pusher cannot see, so keeping it would only leave
 * an edit that can never land. The caller clears these ids from the outbox too,
 * or they would sit there as "pending" forever.
 */
export function dropRemoved<T extends { id: string }>(local: T[], removedIds: readonly string[]): T[] {
  if (removedIds.length === 0) return local;
  const gone = new Set(removedIds);
  const kept = local.filter((r) => !gone.has(r.id));
  return kept.length === local.length ? local : kept;
}

/**
 * Applies a server batch onto local collections, skipping any record that's
 * still dirty (a local edit not yet pushed should not be clobbered by a pull
 * that raced ahead of it).
 */
export function mergeBatch<T extends { id: string }>(local: T[], incoming: T[], dirtyIds: Set<string>): T[] {
  if (incoming.length === 0) return local;
  const byId = new Map(local.map((r) => [r.id, r]));
  let changed = false;
  for (const row of incoming) {
    if (dirtyIds.has(row.id)) continue;
    // Most of what comes back is the server echoing an edit this client just
    // pushed. Keeping the local object for an identical row means the edit
    // changes state once rather than again on the push result and the next
    // pull — each of which re-rendered every row showing it.
    const current = byId.get(row.id);
    if (current !== undefined && sameValue(current, row)) continue;
    byId.set(row.id, row);
    changed = true;
  }
  return changed ? Array.from(byId.values()) : local;
}

/**
 * Structural equality for JSON-shaped records. Key order is ignored, since the
 * server's serialisation need not match the order the client built a row in.
 * Absent and `undefined` are treated alike, as they are once a row is JSON.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((v, i) => sameValue(v, other[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const key of keys) {
    if (!sameValue(ao[key], bo[key])) return false;
  }
  return true;
}

import { Api, ApiError, SyncBatch } from './api';
import { FolderDef, ListDef, SERVER_FEATURES, ServerFeature, Task, ViewPref } from './types';

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
  if (hasServerFeature(features, 'taskReminders')) return task;
  const { reminders: _unsupported, ...compatible } = task;
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
  const lists = state.lists.filter((l) => outbox.has(l.id));
  const folders = state.folders.filter((f) => outbox.has(f.id));
  const viewPrefs = state.viewPrefs.filter((v) => outbox.has(v.id));

  if (tasks.length + lists.length + folders.length + viewPrefs.length === 0) return null;

  const result = await api.push({ tasks, lists, folders, viewPrefs });
  outbox.clear([
    ...tasks.map((t) => t.id),
    ...lists.map((l) => l.id),
    ...folders.map((f) => f.id),
    ...viewPrefs.map((v) => v.id),
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
 * Applies a server batch onto local collections, skipping any record that's
 * still dirty (a local edit not yet pushed should not be clobbered by a pull
 * that raced ahead of it).
 */
export function mergeBatch<T extends { id: string }>(local: T[], incoming: T[], dirtyIds: Set<string>): T[] {
  if (incoming.length === 0) return local;
  const byId = new Map(local.map((r) => [r.id, r]));
  for (const row of incoming) {
    if (dirtyIds.has(row.id)) continue;
    byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

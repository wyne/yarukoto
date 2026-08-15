import { Api, ApiError, SyncBatch } from './api';
import { FolderDef, ListDef, Task, ViewPref } from './types';

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
 *
 * Each id carries a sequence number, bumped on every mark(). That's what lets
 * pushDirty() tell an id apart from a *new* edit to the same id made while the
 * push was in flight: clearing only succeeds if the sequence a caller captured
 * before the request still matches. Without it, marking an id already in the
 * set is a no-op, so an edit made mid-push gets clobbered by clear() right
 * after — the row reads as clean when a newer local edit is still unsent.
 */
export class Outbox {
  private seqs = new Map<string, number>();
  private counter = 0;

  mark(ids: string[]): void {
    for (const id of ids) this.seqs.set(id, ++this.counter);
  }

  has(id: string): boolean {
    return this.seqs.has(id);
  }

  get size(): number {
    return this.seqs.size;
  }

  /** The sequence number an id was last marked with, or undefined if it isn't dirty. */
  seqOf(id: string): number | undefined {
    return this.seqs.get(id);
  }

  /**
   * Removes each id, but only if it hasn't been re-marked since `sent` was
   * captured — an id whose sequence has moved on was edited again during the
   * request that's clearing it, and must stay dirty for the next cycle.
   */
  clear(sent: Map<string, number>): void {
    for (const [id, seq] of sent) {
      if (this.seqs.get(id) === seq) this.seqs.delete(id);
    }
  }

  /** A point-in-time copy, safe to hand to a reducer action. */
  snapshot(): Set<string> {
    return new Set(this.seqs.keys());
  }
}

interface Collections {
  tasks: Task[];
  lists: ListDef[];
  folders: FolderDef[];
  viewPrefs: ViewPref[];
}

/** Sends every dirty record. Returns the server's (possibly corrected) versions. */
export async function pushDirty(api: Api, outbox: Outbox, state: Collections): Promise<SyncBatch> {
  const tasks = state.tasks.filter((t) => outbox.has(t.id));
  const lists = state.lists.filter((l) => outbox.has(l.id));
  const folders = state.folders.filter((f) => outbox.has(f.id));
  const viewPrefs = state.viewPrefs.filter((v) => outbox.has(v.id));

  // Captured before the request goes out, so an edit that lands *during* the
  // await bumps its id's sequence and clear() below leaves it dirty.
  const sentIds = [
    ...tasks.map((t) => t.id),
    ...lists.map((l) => l.id),
    ...folders.map((f) => f.id),
    ...viewPrefs.map((v) => v.id),
  ];
  const sent = new Map(sentIds.map((id) => [id, outbox.seqOf(id)!]));

  const result = await api.push({ tasks, lists, folders, viewPrefs });
  outbox.clear(sent);
  return result;
}

export interface PullResult {
  batch: SyncBatch;
  /**
   * True when `batch` is the complete server truth rather than a delta —
   * either this was the very first pull (no cursor yet) or a 409 forced a
   * re-hydrate. Callers must *replace* state with a full batch, not merge it:
   * a row absent from a full batch may have been hard-deleted server-side
   * with no tombstone left to carry that news, and merging would leave it
   * behind forever.
   */
  full: boolean;
}

export async function pullSince(api: Api, since: string | undefined): Promise<PullResult> {
  try {
    return { batch: await api.pull(since), full: since === undefined };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // Client was offline longer than the retention window — a hard delete could
      // have happened without a tombstone ever reaching it. Re-hydrate fully.
      return { batch: await api.pull(undefined), full: true };
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

/**
 * Applies a *full* server batch (see PullResult.full) onto local collections.
 * Unlike mergeBatch, `incoming` is the complete truth, not a delta: a
 * non-dirty local record absent from it (hard-deleted past retention, no
 * tombstone left) is dropped rather than kept. A still-dirty local record
 * survives by overriding into the result — whether or not the server even
 * knows about it yet, which covers a queued create the server has never seen.
 */
export function mergeFullHydrate<T extends { id: string }>(incoming: T[], local: T[], dirtyIds: Set<string>): T[] {
  const byId = new Map(incoming.map((r) => [r.id, r]));
  for (const row of local) {
    if (dirtyIds.has(row.id)) byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

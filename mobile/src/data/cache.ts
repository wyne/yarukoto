import { FolderDef, ListDef, Task, ViewPref } from './types';

/**
 * A snapshot of everything needed to launch offline and resume syncing without
 * a full re-hydrate: the last-known collections, the sync cursor they're
 * consistent with, and the outbox ids still unpushed.
 *
 * Cursor and data are deliberately one blob, written together. The bug this
 * exists to avoid isn't hypothetical — it already happened once (see the note
 * in storage.ts): a persisted cursor with no data behind it makes the first
 * pull after a restart *incremental*, asking only for what changed since that
 * cursor, and every existing task silently stays invisible. Keeping them in
 * one value that's read back and validated as a unit makes that state
 * unrepresentable — there's no code path that can restore a cursor without
 * the data it was captured alongside.
 */
export interface CacheSnapshot {
  version: 1;
  /** Must match the server the app is currently connected to — a snapshot from
   * a different server (or a previous connection to the same URL, now stale
   * beyond trust) must never be shown as if it were this one's data. */
  serverUrl: string;
  cursor: string;
  tasks: Task[];
  lists: ListDef[];
  folders: FolderDef[];
  viewPrefs: ViewPref[];
  /** Outbox ids still unpushed at the time of the write. Sequence numbers
   * (see Outbox in sync.ts) aren't preserved — they only ever disambiguate a
   * race *within* one in-flight push, and no push is in flight across a
   * restart by definition, so re-marking these ids with fresh sequence
   * numbers on restore is exactly equivalent. */
  outbox: string[];
}

export const CACHE_VERSION = 1;

/**
 * AsyncStorage's web backend is localStorage, which tops out around 5MB per
 * origin. A snapshot that would push past this margin is skipped rather than
 * written — the app keeps running uncached rather than throwing, the same
 * "degrade, don't break" posture initStorage() takes for blocked storage.
 */
export const MAX_CACHE_BYTES = 4 * 1024 * 1024;

export function serialize(snapshot: CacheSnapshot): string {
  return JSON.stringify(snapshot);
}

export function fitsCache(serialized: string): boolean {
  return serialized.length <= MAX_CACHE_BYTES;
}

/**
 * Parses and validates a cached blob against the server the app is currently
 * connected to. Anything that doesn't check out — malformed JSON, a version
 * from a future or past shape, a snapshot captured for a different server —
 * returns null rather than throwing, so a corrupt or stale cache falls back
 * to exactly today's behaviour: empty state, undefined cursor, full hydrate.
 */
export function deserialize(raw: string | null, serverUrl: string): CacheSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isCacheSnapshot(parsed)) return null;
  if (parsed.serverUrl !== serverUrl) return null;
  return parsed;
}

function isCacheSnapshot(value: unknown): value is CacheSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === CACHE_VERSION &&
    typeof v.serverUrl === 'string' &&
    typeof v.cursor === 'string' &&
    Array.isArray(v.tasks) &&
    Array.isArray(v.lists) &&
    Array.isArray(v.folders) &&
    Array.isArray(v.viewPrefs) &&
    Array.isArray(v.outbox)
  );
}

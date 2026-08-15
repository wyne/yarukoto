import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistence for the server connection (mode, server URL, access token) and
 * the offline cache (see cache.ts): the last-known tasks/lists/folders/
 * viewPrefs, the cursor they're consistent with, and the outbox.
 *
 * AsyncStorage is async on every platform (on web it's localStorage underneath),
 * but the callers here are reducer initialisers and render paths that can't await.
 * So the whole keyspace is read once into memory by `initStorage()` at startup,
 * and every read after that is synchronous against that cache. Writes update
 * the cache immediately and persist in the background.
 *
 * The alternative, making every caller async, would mean a loading state
 * threaded through `initState()` and the provider for the sake of a value
 * that's read once per launch.
 */

const URL_KEY = 'yarukoto.serverUrl';
const MODE_KEY = 'yarukoto.mode';
const TOKEN_KEY = 'yarukoto.token';
const CACHE_KEY = 'yarukoto.cache';

const ALL_KEYS = [URL_KEY, MODE_KEY, TOKEN_KEY, CACHE_KEY];

let cache: Record<string, string | null> = {};
let primed = false;

/**
 * Loads the persisted keys into memory. Must resolve before anything renders —
 * a read before this lands looks exactly like a first run, which would drop a
 * returning user back on the connect screen.
 */
export async function initStorage(): Promise<void> {
  try {
    const entries = await AsyncStorage.multiGet(ALL_KEYS);
    cache = Object.fromEntries(entries);
  } catch {
    // Blocked or unavailable storage (private-mode Safari, for one) shouldn't
    // stop the app from starting — it just won't remember anything.
    cache = {};
  }
  primed = true;
}

function read(key: string): string | null {
  if (__DEV__ && !primed) {
    console.warn(`storage: read of "${key}" before initStorage() resolved; treated as unset.`);
  }
  return cache[key] ?? null;
}

function write(key: string, value: string): void {
  cache[key] = value;
  // Fire-and-forget: the cache is already authoritative for this session, so a
  // failed write costs a re-connect next launch rather than breaking anything now.
  AsyncStorage.setItem(key, value).catch(() => {});
}

function remove(key: string): void {
  cache[key] = null;
  AsyncStorage.removeItem(key).catch(() => {});
}

export function loadServerUrl(): string {
  return read(URL_KEY) ?? '';
}

export function saveServerUrl(url: string): void {
  write(URL_KEY, url);
}

export function clearServerUrl(): void {
  remove(URL_KEY);
}

/**
 * Which mode the app is in. Only the *choice* is persisted — sample data itself
 * is rebuilt on every launch rather than stored, which keeps its due dates
 * relative to today instead of drifting into a wall of overdue tasks.
 */
export type AppMode = 'none' | 'sample' | 'server';

export function loadMode(): AppMode {
  const stored = read(MODE_KEY);
  if (stored === 'sample' || stored === 'server') return stored;
  // A URL saved before modes existed means a previous session connected.
  return loadServerUrl() ? 'server' : 'none';
}

export function saveMode(mode: AppMode): void {
  if (mode === 'none') remove(MODE_KEY);
  else write(MODE_KEY, mode);
}

export function loadToken(): string {
  return read(TOKEN_KEY) ?? '';
}

export function saveToken(token: string): void {
  write(TOKEN_KEY, token);
}

export function clearToken(): void {
  remove(TOKEN_KEY);
}

/**
 * The offline cache, as a single opaque blob — see cache.ts for what it holds
 * and why cursor and data are never split apart. This used to be a documented
 * non-goal: persisting the cursor without caching the data it came with made
 * a restart's first pull *incremental*, asking only for what changed since
 * that cursor and silently returning nothing, so every existing task stayed
 * invisible until something touched it server-side again. That's exactly the
 * shape cache.ts's validation exists to make impossible — restoring one
 * without the other simply isn't a code path that exists anymore.
 */
export function loadCache(): string | null {
  return read(CACHE_KEY);
}

export function saveCache(json: string): void {
  write(CACHE_KEY, json);
}

export function clearCache(): void {
  remove(CACHE_KEY);
}

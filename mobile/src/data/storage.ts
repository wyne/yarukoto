/**
 * Minimal persistence for the server connection, so a browser refresh doesn't
 * land on the first-run screen every time.
 *
 * Web only, by design: it's a development convenience, and everything else in the
 * app (tasks, lists, view options) is still in-memory mock data that resets on
 * reload. Making this work on device would mean adding AsyncStorage, which isn't
 * worth a native dependency until there's a real server to persist against.
 */
const URL_KEY = 'yarukoto.serverUrl';
const MODE_KEY = 'yarukoto.mode';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private-mode Safari throws on access rather than returning null.
    return null;
  }
}

export function loadServerUrl(): string {
  return store()?.getItem(URL_KEY) ?? '';
}

export function saveServerUrl(url: string): void {
  try {
    store()?.setItem(URL_KEY, url);
  } catch {
    // Full or blocked storage shouldn't break connecting.
  }
}

export function clearServerUrl(): void {
  try {
    store()?.removeItem(URL_KEY);
  } catch {
    // ignore
  }
}

/**
 * Which mode the app is in. Only the *choice* is persisted — sample data itself
 * is rebuilt on every launch rather than stored, which keeps its due dates
 * relative to today instead of drifting into a wall of overdue tasks.
 */
export type AppMode = 'none' | 'sample' | 'server';

export function loadMode(): AppMode {
  const stored = store()?.getItem(MODE_KEY);
  if (stored === 'sample' || stored === 'server') return stored;
  // A URL saved before modes existed means a previous session connected.
  return loadServerUrl() ? 'server' : 'none';
}

export function saveMode(mode: AppMode): void {
  try {
    if (mode === 'none') store()?.removeItem(MODE_KEY);
    else store()?.setItem(MODE_KEY, mode);
  } catch {
    // ignore
  }
}

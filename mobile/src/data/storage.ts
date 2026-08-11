/**
 * Minimal persistence for the server connection, so a browser refresh doesn't
 * land on the first-run screen every time.
 *
 * Web only, by design: it's a development convenience, and everything else in the
 * app (tasks, lists, view options) is still in-memory mock data that resets on
 * reload. Making this work on device would mean adding AsyncStorage, which isn't
 * worth a native dependency until there's a real server to persist against.
 */
const KEY = 'yarukoto.serverUrl';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private-mode Safari throws on access rather than returning null.
    return null;
  }
}

export function loadServerUrl(): string {
  return store()?.getItem(KEY) ?? '';
}

export function saveServerUrl(url: string): void {
  try {
    store()?.setItem(KEY, url);
  } catch {
    // Full or blocked storage shouldn't break connecting.
  }
}

export function clearServerUrl(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    // ignore
  }
}

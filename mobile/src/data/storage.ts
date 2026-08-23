import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCENT_OPTIONS, AccentColor, DEFAULT_ACCENT } from '../theme/colors';

/**
 * Persistence for the server connection — which mode the app is in, the server
 * URL and access token — and for the device-local UI preferences: accent colour,
 * the Plan screen's layout, and which sections a view has collapsed.
 *
 * These preferences stay on the device rather than syncing. Unlike grouping and
 * sort, which describe how you want a list arranged everywhere, they describe how
 * one screen is set up on one machine — a phone and a desktop have no reason to
 * agree about a collapsed sidebar section or which pane layout is on screen.
 *
 * AsyncStorage is async on every platform (on web it's localStorage underneath),
 * but the callers here are reducer initialisers and render paths that can't await.
 * So the whole keyspace — a handful of small strings — is read once into memory by
 * `initStorage()` at startup, and every read after that is synchronous against
 * that cache. Writes update the cache immediately and persist in the background.
 *
 * The alternative, making every caller async, would mean a loading state
 * threaded through `initState()` and the provider for the sake of a few hundred
 * bytes read once per launch.
 */

const URL_KEY = 'yarukoto.serverUrl';
const MODE_KEY = 'yarukoto.mode';
const TOKEN_KEY = 'yarukoto.token';
const ACCENT_KEY = 'yarukoto.accent';
const PLAN_KEY = 'yarukoto.planPrefs';
const COLLAPSED_KEY = 'yarukoto.collapsedSections';
const SAVED_SERVERS_KEY = 'yarukoto.savedServers';
const FOLDERS_KEY = 'yarukoto.collapsedFolders';

const ALL_KEYS = [URL_KEY, MODE_KEY, TOKEN_KEY, ACCENT_KEY, PLAN_KEY, COLLAPSED_KEY, SAVED_SERVERS_KEY, FOLDERS_KEY];

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

/** Parses a stored JSON value, treating anything unreadable as unset. */
function readJson<T>(key: string): T | null {
  const raw = read(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  write(key, JSON.stringify(value));
}

/**
 * The accent colour. A value that's no longer in the palette — an older build's
 * choice, or a hand-edited store — falls back to the default rather than tinting
 * the app with something the picker can't show as selected.
 */
export function loadAccent(): AccentColor {
  const stored = read(ACCENT_KEY);
  return ACCENT_OPTIONS.includes(stored as AccentColor) ? (stored as AccentColor) : DEFAULT_ACCENT;
}

export function saveAccent(accent: AccentColor): void {
  write(ACCENT_KEY, accent);
}

/** Which calendar layout the Plan screen is in. 'multi' is the few-day column view. */
export type PlanMode = 'day' | 'multi' | 'week';

const PLAN_MODES: PlanMode[] = ['day', 'multi', 'week'];

export interface PlanPrefs {
  mode: PlanMode;
  showCompleted: boolean;
}

export const DEFAULT_PLAN_PREFS: PlanPrefs = { mode: 'day', showCompleted: false };

export function loadPlanPrefs(): PlanPrefs {
  const stored = readJson<Partial<PlanPrefs>>(PLAN_KEY);
  if (!stored) return DEFAULT_PLAN_PREFS;
  return {
    mode: PLAN_MODES.includes(stored.mode as PlanMode) ? (stored.mode as PlanMode) : DEFAULT_PLAN_PREFS.mode,
    showCompleted: typeof stored.showCompleted === 'boolean' ? stored.showCompleted : DEFAULT_PLAN_PREFS.showCompleted,
  };
}

export function savePlanPrefs(prefs: PlanPrefs): void {
  writeJson(PLAN_KEY, prefs);
}

/** Which sections of one view are folded shut. */
export interface CollapsedSections {
  /** Group header keys, as produced by `groupTasks`. */
  groups: string[];
  /** The Completed section at the bottom of a list. */
  completed: boolean;
}

export const NO_COLLAPSED_SECTIONS: CollapsedSections = { groups: [], completed: false };

function isDefaultCollapse(value: CollapsedSections): boolean {
  return value.groups.length === 0 && !value.completed;
}

/**
 * Collapse state for every view lives under one key, keyed by the same view key
 * that identifies a `ViewPref` — so a list and a tag filter each remember their
 * own folded sections.
 */
function collapsedMap(): Record<string, CollapsedSections> {
  return readJson<Record<string, CollapsedSections>>(COLLAPSED_KEY) ?? {};
}

export function loadCollapsedSections(viewKey: string): CollapsedSections {
  const stored = collapsedMap()[viewKey];
  if (!stored) return NO_COLLAPSED_SECTIONS;
  return {
    groups: Array.isArray(stored.groups) ? stored.groups.filter((g) => typeof g === 'string') : [],
    completed: stored.completed === true,
  };
}

export function saveCollapsedSections(viewKey: string, value: CollapsedSections): void {
  const map = collapsedMap();
  // A view that's back to fully expanded drops out of the map entirely, so this
  // doesn't accumulate an entry for every view ever opened.
  if (isDefaultCollapse(value)) {
    if (!(viewKey in map)) return;
    delete map[viewKey];
  } else {
    map[viewKey] = value;
  }
  writeJson(COLLAPSED_KEY, map);
}

export interface SavedServer {
  url: string;
  token: string;
}

export function loadSavedServers(): SavedServer[] {
  return readJson<SavedServer[]>(SAVED_SERVERS_KEY) ?? [];
}

function saveSavedServers(servers: SavedServer[]): void {
  writeJson(SAVED_SERVERS_KEY, servers);
}

export function addSavedServer(url: string, token: string): void {
  const servers = loadSavedServers().filter((s) => s.url !== url);
  servers.unshift({ url, token });
  saveSavedServers(servers);
}

export function removeSavedServer(url: string): void {
  saveSavedServers(loadSavedServers().filter((s) => s.url !== url));
}

/**
 * The sync cursor is deliberately *not* persisted. Task data isn't cached
 * locally, so state starts empty on every launch — and a saved cursor would then
 * make the first pull incremental, asking only for rows changed since last time
 * and silently returning nothing. Every existing task would stay invisible until
 * something happened to touch it server-side.
 *
 * Keeping the cursor in memory means each launch does one full hydrate, which is
 * cheap for a personal task list and correct by construction. Persisting it only
 * becomes worthwhile alongside a local cache of the tasks themselves.
 */

/**
 * Folders the user has folded shut in the nav.
 *
 * Device-local rather than synced, like the other collapse state above: which
 * folders you have shut is about the screen in front of you, not about how the
 * lists are arranged. The ordering right next to it in the nav *is* synced,
 * because that is an arrangement you would expect to travel.
 */
export function loadCollapsedFolders(): string[] {
  const stored = readJson<unknown>(FOLDERS_KEY);
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
}

export function saveCollapsedFolders(ids: string[]): void {
  if (ids.length === 0) remove(FOLDERS_KEY);
  else writeJson(FOLDERS_KEY, ids);
}

/**
 * The tasks you have had open, most recent first, for the task switcher (⌃Tab).
 *
 * A task counts once it has stayed open a moment, or was gone to with the
 * switcher itself. With the task pane up, every ↑ and ↓ in a list opens the task
 * it lands on, and the switcher is for the tasks you were working on, not every
 * row passed on the way to one.
 *
 * Kept on this device for this run of the app: which task you were looking at
 * a minute ago is a fact about this window, not about the tasks.
 */

/** How many tasks the switcher lists, the open one included. */
export const RECENT_LIMIT = 10;

/** How long a task has to stay open to count. */
export const DWELL_MS = 1000;

/** `id` to the front of `recents`, once. */
export function withRecent(recents: readonly string[], id: string, limit = RECENT_LIMIT): string[] {
  return [id, ...recents.filter((r) => r !== id)].slice(0, limit);
}

/**
 * What the switcher lists: the open task first, then the rest by how recently
 * they were open — only those that still exist and aren't done.
 */
export function switcherList(
  openTaskId: string | null,
  recents: readonly string[],
  isLive: (id: string) => boolean,
  limit = RECENT_LIMIT
): string[] {
  const ids = openTaskId ? withRecent(recents, openTaskId, Infinity) : [...recents];
  return ids.filter(isLive).slice(0, limit);
}

export interface SwitcherState {
  /** The tasks listed while it is up; empty while it isn't. */
  list: string[];
  index: number;
}

export const SWITCHER_CLOSED: SwitcherState = { list: [], index: 0 };

/**
 * One ⌃Tab (1) or ⌃⇧Tab / ⌃` (-1). The first press opens the list on the task
 * before the open one, or on the last task going backwards; the ones after move
 * round it. `list` is only read on the first press: the list holds still while
 * it is up.
 */
export function stepSwitcher(state: SwitcherState, delta: 1 | -1, list: string[], openTaskId: string | null): SwitcherState {
  if (state.list.length > 0) {
    const n = state.list.length;
    return { list: state.list, index: (state.index + delta + n) % n };
  }
  if (list.length === 0) return SWITCHER_CLOSED;
  // Nothing open: the first press is on the most recent task itself.
  const start = openTaskId && list[0] === openTaskId ? 1 : 0;
  const index = delta === 1 ? Math.min(start, list.length - 1) : list.length - 1;
  return { list, index };
}

// The store the app keeps.

let recents: string[] = [];
let dwellTimer: ReturnType<typeof setTimeout> | undefined;
/** A task gone to with the switcher, which counts at once. */
let switchedTo: string | null = null;

/** The recents as they stand, most recent first. */
export function recentTaskIds(): readonly string[] {
  return recents;
}

/** Says the switcher is going to this task, so it counts the moment it opens. */
export function noteSwitchedTo(id: string) {
  switchedTo = id;
}

/** Called as the open task changes. */
export function taskOpened(id: string | null) {
  clearTimeout(dwellTimer);
  dwellTimer = undefined;
  if (!id) return;
  if (switchedTo === id) {
    switchedTo = null;
    recents = withRecent(recents, id);
    return;
  }
  dwellTimer = setTimeout(() => {
    recents = withRecent(recents, id);
  }, DWELL_MS);
}

/** For tests: forgets everything. */
export function resetRecentTasks() {
  clearTimeout(dwellTimer);
  dwellTimer = undefined;
  switchedTo = null;
  recents = [];
}

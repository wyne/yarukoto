import { useSyncExternalStore } from 'react';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { navigationRef } from './DateTimePickerContext';
import { tabNavigation } from './destinations';
import type { BrowseParams, InboxParams, NativeTaskViewParams } from './types';

/**
 * Where you have been, for View ▸ Back and Forward (⌘[ and ⌘]).
 *
 * A destination is a row of the sidebar — a view, a list, folder or tag, a
 * saved filter — in the terms the sidebar navigates in, so going back is the same
 * navigation a click on that row makes (`tabNavigation`). Read off the navigation state rather
 * than recorded where each navigation starts, since the sidebar, the command
 * menu, ⌘1–⌘8 and Go to Task all get there by different routes.
 *
 * Desktop only, like the commands it answers.
 */
export interface Destination {
  route: string;
  params?: InboxParams & BrowseParams;
}

type AnyState = NavigationState | PartialState<NavigationState>;
type AnyRoute = { name: string; params?: object; state?: AnyState };

const routeOf = (state: AnyState | undefined): AnyRoute | undefined =>
  state?.routes[state.index ?? state.routes.length - 1] as AnyRoute | undefined;

/** A list, folder or tag on the Inbox row's route, as `tabNavigation` takes it. */
function filterOf(params: InboxParams | undefined): InboxParams | undefined {
  if (params?.listId) return { listId: params.listId };
  if (params?.folderId) return { folderId: params.folderId };
  if (params?.tag) return { tag: params.tag };
  return undefined;
}

/** The first native tab's stack screens, by the sidebar row each one is. */
const NATIVE_LIST_SCREENS: Record<string, string> = { Activity: 'ActivityTab', Trash: 'TrashTab', Archive: 'ArchiveTab' };

/**
 * The sidebar row a navigation state is showing, or null while it shows none
 * — before the main screen is up, say.
 */
export function destinationOf(root: AnyState | undefined): Destination | null {
  const main = root?.routes.find((r) => r.name === 'Main') as AnyRoute | undefined;
  const tab = routeOf(main?.state);
  if (!tab) return null;
  if (tab.name === 'ListsTab') {
    // Native: the first tab is a stack holding All, the filtered views, Activity,
    // Trash and Archive. Its params say where it is headed before its own state
    // exists, as the sidebar reads them too.
    const nested = routeOf(tab.state);
    const pending = tab.params as { screen?: string; params?: NativeTaskViewParams } | undefined;
    const screen = nested?.name ?? pending?.screen ?? 'Tasks';
    if (screen !== 'Tasks') return NATIVE_LIST_SCREENS[screen] ? { route: NATIVE_LIST_SCREENS[screen] } : null;
    const params = (nested ? nested.params : pending?.params) as NativeTaskViewParams | undefined;
    const filter = filterOf(params);
    if (filter) return { route: 'InboxTab', params: filter };
    return params?.view === 'today' ? null : { route: 'AllTab' };
  }
  if (tab.name === 'InboxTab') {
    const filter = filterOf(tab.params as InboxParams | undefined);
    return filter ? { route: 'InboxTab', params: filter } : { route: 'InboxTab' };
  }
  if (tab.name === 'BrowseTab') {
    const savedFilterId = (tab.params as BrowseParams | undefined)?.savedFilterId;
    return savedFilterId ? { route: 'BrowseTab', params: { savedFilterId } } : { route: 'BrowseTab' };
  }
  return { route: tab.name };
}

function sameDestination(a: Destination, b: Destination): boolean {
  return (
    a.route === b.route
    && a.params?.listId === b.params?.listId
    && a.params?.folderId === b.params?.folderId
    && a.params?.tag === b.params?.tag
    && a.params?.savedFilterId === b.params?.savedFilterId
  );
}

/** How far back the history goes. */
export const HISTORY_LIMIT = 100;

/**
 * The history itself, as a browser keeps one: a trail and a place in it. A new
 * destination drops whatever was ahead of you; Back and Forward only move the
 * place, so arriving where they sent you adds nothing.
 */
export function createNavHistory(limit = HISTORY_LIMIT) {
  let entries: Destination[] = [];
  let index = -1;
  return {
    /** Records arriving somewhere. False when it is where you already are. */
    visit(destination: Destination): boolean {
      if (index >= 0 && sameDestination(entries[index], destination)) return false;
      entries = [...entries.slice(0, index + 1), destination].slice(-limit);
      index = entries.length - 1;
      return true;
    },
    back(): Destination | undefined {
      if (index <= 0) return undefined;
      index -= 1;
      return entries[index];
    },
    forward(): Destination | undefined {
      if (index >= entries.length - 1) return undefined;
      index += 1;
      return entries[index];
    },
    canGoBack: () => index > 0,
    canGoForward: () => index < entries.length - 1,
  };
}

/**
 * How long a destination has to stay on screen to be recorded. Holding ↓ in the
 * sidebar shows every row it passes, and Back should go to where you were, not
 * to the row before the one you stopped on.
 */
export const SETTLE_MS = 300;

const history = createNavHistory();
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let state = { canGoBack: false, canGoForward: false };
const subscribers = new Set<() => void>();

function publish() {
  const next = { canGoBack: history.canGoBack(), canGoForward: history.canGoForward() };
  if (next.canGoBack === state.canGoBack && next.canGoForward === state.canGoForward) return;
  state = next;
  subscribers.forEach((notify) => notify());
}

/** The sidebar row on screen now. */
export function currentDestination(): Destination | null {
  return navigationRef.isReady() ? destinationOf(navigationRef.getRootState()) : null;
}

function record() {
  clearTimeout(settleTimer);
  settleTimer = undefined;
  const here = currentDestination();
  if (here) history.visit(here);
  publish();
}

/** Records a destination still settling now, so Back starts from where you are. */
function flush() {
  if (settleTimer !== undefined) record();
}

/** Keeps the history from the navigation container's changes. Returns the unsubscribe. */
export function watchNavHistory(): () => void {
  record();
  const off = navigationRef.addListener('state', () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(record, SETTLE_MS);
  });
  return () => {
    off();
    clearTimeout(settleTimer);
    settleTimer = undefined;
  };
}

function travel(destination: Destination | undefined) {
  publish();
  if (!destination) return;
  // A saved filter's `at` says "apply it again", as a press of its row does.
  const params = destination.params?.savedFilterId ? { ...destination.params, at: Date.now() } : destination.params;
  const [name, next] = tabNavigation(destination.route, params);
  (navigationRef.navigate as (name: string, params?: object) => void)('Main', { screen: name, params: next });
}

export function goBack() {
  flush();
  travel(history.back());
}

export function goForward() {
  flush();
  travel(history.forward());
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** Whether there is anywhere to go back or forward to, for dimming the commands. */
export function useNavHistory(): { canGoBack: boolean; canGoForward: boolean } {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { DESKTOP_UI } from '../data/platform';
import { useScreenFocused } from './MenuCommands';

/**
 * Where the keyboard goes when it leaves one part of the window for another.
 *
 * The desktop window is a ring of panes — the sidebar, the add field, the task
 * list, the task open beside it — and Tab, Shift-Tab and Escape move between them. Each pane
 * says how it takes the keyboard by registering here while its screen is in
 * front, the way a screen answers a command through `useCommand`; whoever moves
 * focus only names the pane, and never needs to know which screen is up.
 *
 * Desktop only: a phone has no Tab key, and nothing to move between.
 */
export type Pane = 'sidebar' | 'add' | 'list' | 'pane';

/** The order Tab goes round in. Shift-Tab goes the other way. */
const RING: Pane[] = ['sidebar', 'add', 'list', 'pane'];

/** Registered focusers per pane; the last one is the screen in front. */
const focusers = new Map<Pane, (() => void)[]>();

/**
 * A pane asked for before it was there — the task pane, a frame after the task
 * was opened. Short-lived, so a pane that turns up much later for some other
 * reason doesn't take the keyboard.
 */
let pending: { pane: Pane; at: number } | null = null;
const PENDING_MS = 1500;

/**
 * Hands the keyboard to a pane. False when no pane of that kind is on screen.
 *
 * `mounting` is for a pane that is about to appear, or to change — opening
 * another task may remount the task pane. The keyboard then goes to the pane
 * that registers next, rather than to the one on its way out, or after a
 * couple of frames to whichever is there if none does.
 */
export function focusPane(pane: Pane, { mounting = false }: { mounting?: boolean } = {}): boolean {
  if (mounting) {
    const asked = { pane, at: Date.now() };
    pending = asked;
    // If the pane is only re-rendered rather than remounted, nothing registers
    // anew; hand it over after two frames, by when it shows the new task.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (pending !== asked) return;
        pending = null;
        focusers.get(pane)?.at(-1)?.();
      })
    );
    return true;
  }
  const stack = focusers.get(pane);
  if (!stack?.length) return false;
  pending = null;
  stack[stack.length - 1]();
  return true;
}

/**
 * Moves on from `from` around the ring, skipping a pane that isn't there — the
 * task pane while no task is open, or the add field on a view that has none.
 */
export function focusNextPane(from: Pane, delta: 1 | -1): void {
  const start = RING.indexOf(from);
  for (let step = 1; step < RING.length; step++) {
    const next = RING[(((start + delta * step) % RING.length) + RING.length) % RING.length];
    if (focusPane(next)) return;
  }
}

/** Takes the keyboard for `pane` while this screen is in front, and `enabled`. */
export function usePaneFocus(pane: Pane, focus: () => void, enabled = true) {
  const screenFocused = useScreenFocused();
  const latest = useRef(focus);
  latest.current = focus;
  const active = DESKTOP_UI && enabled && screenFocused;

  useEffect(() => {
    if (!active) return;
    const run = () => latest.current();
    focusers.set(pane, [...(focusers.get(pane) ?? []), run]);
    if (pending?.pane === pane) {
      if (Date.now() - pending.at < PENDING_MS) requestAnimationFrame(run);
      pending = null;
    }
    return () => {
      focusers.set(pane, (focusers.get(pane) ?? []).filter((f) => f !== run));
    };
  }, [pane, active]);
}

/**
 * Whether the task list holds the keyboard, so its cursor row can be drawn in
 * the accent while it does and in gray while something else has it — which is
 * how every Mac list says where your keys are going.
 *
 * The Mac reports it from the list's own key view (ListKeys). The web counts
 * the list as holding the keyboard whenever no field does, since that is when
 * its keys reach the list (MenuCommands).
 */
let listHasKeyboard = true;
const subscribers = new Set<() => void>();

export function setListHasKeyboard(next: boolean) {
  if (next === listHasKeyboard) return;
  listHasKeyboard = next;
  subscribers.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

export function useListHasKeyboard(): boolean {
  return useSyncExternalStore(subscribe, () => listHasKeyboard, () => listHasKeyboard);
}

/**
 * Whether the sidebar holds the keyboard.
 *
 * Arrowing through the sidebar brings a new list to the front on every key, and
 * a list takes the keyboard as it appears (ListKeys) — which would pull the
 * arrows out of the sidebar after one press. So while the sidebar has it, a
 * list neither claims the keyboard on arriving nor can be made to, until
 * something hands the keyboard on (`takeKeyboardFromSidebar`).
 */
let sidebarHasKeyboard = false;
const sidebarSubscribers = new Set<() => void>();

export function setSidebarHasKeyboard(next: boolean) {
  if (next === sidebarHasKeyboard) return;
  sidebarHasKeyboard = next;
  // The Mac hears the list resign on its own; the web has no other way to know.
  if (next) setListHasKeyboard(false);
  sidebarSubscribers.forEach((notify) => notify());
}

export function sidebarHoldsKeyboard(): boolean {
  return sidebarHasKeyboard;
}

export function useSidebarHoldsKeyboard(): boolean {
  return useSyncExternalStore(
    (notify) => {
      sidebarSubscribers.add(notify);
      return () => {
        sidebarSubscribers.delete(notify);
      };
    },
    () => sidebarHasKeyboard,
    () => sidebarHasKeyboard
  );
}

/**
 * Runs `claim` once the sidebar has let go: at once if it doesn't hold the
 * keyboard, else a frame after releasing it, so the list can take focus again
 * by the time it is asked to.
 */
export function takeKeyboardFromSidebar(claim: () => void) {
  if (!sidebarHasKeyboard) return claim();
  setSidebarHasKeyboard(false);
  requestAnimationFrame(claim);
}

/** The web's half of `useListHasKeyboard`: the list has it while no field does. */
export function useWebListKeyboardTracking(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const update = () => setListHasKeyboard(!sidebarHasKeyboard && !isTextTarget(document.activeElement));
    update();
    // focusout lands before the next element is focused, so read a turn later.
    const later = () => setTimeout(update, 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', later);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', later);
    };
  }, [enabled]);
}

/** Whether a DOM element is somewhere text is typed. */
export function isTextTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** On the web, lets go of whatever field has focus, so the list's keys reach it. */
export function releaseWebField() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const el = document.activeElement as HTMLElement | null;
  if (isTextTarget(el)) el?.blur();
}

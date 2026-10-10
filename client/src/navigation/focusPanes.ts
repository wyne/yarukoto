import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { DESKTOP_UI } from '../data/platform';
import { useScreenFocused } from './MenuCommands';

/**
 * Where the keyboard goes when it leaves one part of the window for another.
 *
 * The desktop window is a ring of panes — the add field, the task list, the task
 * open beside it — and Tab, Shift-Tab and Escape move between them. Each pane
 * says how it takes the keyboard by registering here while its screen is in
 * front, the way a screen answers a command through `useCommand`; whoever moves
 * focus only names the pane, and never needs to know which screen is up.
 *
 * Desktop only: a phone has no Tab key, and nothing to move between.
 */
export type Pane = 'add' | 'list' | 'pane';

/** The order Tab goes round in. Shift-Tab goes the other way. */
const RING: Pane[] = ['add', 'list', 'pane'];

/** Registered focusers per pane; the last one is the screen in front. */
const focusers = new Map<Pane, (() => void)[]>();

/** Hands the keyboard to a pane. False when no pane of that kind is on screen. */
export function focusPane(pane: Pane): boolean {
  const stack = focusers.get(pane);
  if (!stack?.length) return false;
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

/** The web's half of `useListHasKeyboard`: the list has it while no field does. */
export function useWebListKeyboardTracking(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const update = () => setListHasKeyboard(!isTextTarget(document.activeElement));
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

import { useSyncExternalStore } from 'react';

/**
 * A one-line note about a key, shown where the undo notice shows: "Press ⌘⌫ to
 * move to Trash" when a plain ⌫ lands on the list. It says what the key didn't
 * do and which one would, then goes away on its own.
 */

/** Long enough to read, short enough not to linger over the next thing. */
export const KEY_HINT_MS = 2500;

export interface KeyHint {
  text: string;
  /** Changes on every showing, so a repeat restarts the clock and the fade. */
  token: number;
}

let current: KeyHint | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let next = 0;
const subscribers = new Set<() => void>();

function set(hint: KeyHint | null) {
  current = hint;
  subscribers.forEach((notify) => notify());
}

export function showKeyHint(text: string) {
  if (timer) clearTimeout(timer);
  set({ text, token: ++next });
  timer = setTimeout(() => {
    timer = null;
    set(null);
  }, KEY_HINT_MS);
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

export function useKeyHint(): KeyHint | null {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

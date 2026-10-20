import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * How many desktop layers — popovers, dialogs — are up right now.
 *
 * A task-list command never runs while one is: an arrow or ⌘Return pressed in
 * a popover is about the popover, not the list behind it. And when the last
 * one closes, the list takes the keyboard back (see ListKeys), since on the
 * Mac a closing dialog leaves nothing with focus.
 */
let open = 0;
const closedListeners = new Set<() => void>();

export function anyLayerOpen(): boolean {
  return open > 0;
}

/** Counts this layer as open while `active`. */
export function useOpenLayer(active: boolean) {
  useEffect(() => {
    if (!active) return;
    open += 1;
    return () => {
      open -= 1;
      if (open === 0) closedListeners.forEach((listener) => listener());
    };
  }, [active]);
}

/**
 * Runs `fn` now, or once the last open layer has gone.
 *
 * For a command that moves focus and can be run from the command menu, which
 * is still closing when the command runs. On the web a dialog holds on to focus
 * until it has left the page — after its fade-out, if it has one — and focus
 * handed elsewhere before then is pulled back into it, so there it waits for
 * that, not just for the layer to be counted closed.
 */
export function afterLayersClose(fn: () => void) {
  const run = () => (Platform.OS === 'web' ? afterWebDialogsGone(fn) : fn());
  if (open === 0) return run();
  const once = () => {
    closedListeners.delete(once);
    run();
  };
  closedListeners.add(once);
}

/** About a second: a fade-out is a quarter of that, and this must not wait forever. */
const DIALOG_GONE_FRAMES = 60;

function afterWebDialogsGone(fn: () => void, frames = 0) {
  const up = typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]');
  if (!up || frames >= DIALOG_GONE_FRAMES) return fn();
  requestAnimationFrame(() => afterWebDialogsGone(fn, frames + 1));
}

/** Calls `listener` whenever the last open layer closes. */
export function useAllLayersClosed(listener: () => void) {
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => {
    const run = () => latest.current();
    closedListeners.add(run);
    return () => {
      closedListeners.delete(run);
    };
  }, []);
}

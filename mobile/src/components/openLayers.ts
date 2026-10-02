import { useEffect, useRef } from 'react';

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

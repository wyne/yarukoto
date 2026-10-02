import { useEffect } from 'react';

/**
 * How many desktop layers — popovers, dialogs — are up right now.
 *
 * The web answers list shortcuts from a `document` listener, which hears a key
 * whatever is in front; it reads this so an arrow pressed in a popover doesn't
 * also move the list behind it. The Mac asks UIKit whether anything is
 * presented instead (MacMenuBar.swift), so nothing there reads this.
 */
let open = 0;

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
    };
  }, [active]);
}

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Dimensions, ScaledSize } from 'react-native';

const subscribe = (onChange: () => void) => {
  const subscription = Dimensions.addEventListener('change', onChange);
  return () => subscription.remove();
};

/**
 * Something derived from the window's size, re-rendering only when it changes.
 *
 * `useWindowDimensions` re-renders its caller on every pixel of a window resize.
 * Most callers only want a threshold — wide or not, room for tags or not — and on
 * the Mac a drag-resize sends a size per frame, so every row and screen reading
 * it redrew dozens of times a second to arrive at the same answer. Here React
 * compares what `select` returns and skips the render when it hasn't moved.
 *
 * `select` must return a primitive (or something equally stable): a fresh object
 * would compare unequal every time and re-render as often as before.
 */
export function useWindowSelector<T>(select: (window: ScaledSize) => T): T {
  return useSyncExternalStore(subscribe, () => select(Dimensions.get('window')));
}

/** How long after the last size change a resize counts as finished. */
const RESIZE_SETTLE_MS = 250;

/**
 * True while the window is being resized, false once it has held still for
 * `RESIZE_SETTLE_MS`. Renders twice per drag — at its start and at its end —
 * however many sizes the drag passes through.
 */
export function useWindowResizing(): boolean {
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = Dimensions.addEventListener('change', () => {
      setResizing(true);
      clearTimeout(timer);
      timer = setTimeout(() => setResizing(false), RESIZE_SETTLE_MS);
    });
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, []);
  return resizing;
}

/**
 * The window's size, followed only while `active`, and held at its last value
 * while not.
 *
 * For a layer that sizes itself to the window — a dialog, a popover — but is
 * closed nearly all the time. Every screen keeps a few of them mounted, and with
 * `useWindowDimensions` each one re-rendered on every frame of a resize to
 * measure a card nobody could see.
 */
export function useWindowSizeWhile(active: boolean): { width: number; height: number } {
  const last = useRef<{ width: number; height: number } | null>(null);
  return useSyncExternalStore(subscribe, () => {
    if (active || !last.current) {
      const { width, height } = Dimensions.get('window');
      if (!last.current || last.current.width !== width || last.current.height !== height) {
        last.current = { width, height };
      }
    }
    return last.current;
  });
}

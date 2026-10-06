import { Platform } from 'react-native';

/**
 * Suppresses the browser's own gestures for as long as a drag is in flight.
 *
 * On mobile web the finger that's dragging a row is still a finger the browser is
 * tracking: it scrolls the page with it, and once the touch has been held long
 * enough it starts a text selection and hangs the callout bar over it. The responder
 * system doesn't cancel either of those — react-native-web listens for the resulting
 * `selectionchange`/`scroll` and *terminates* the drag instead — so the drag has to
 * turn them off itself.
 *
 * `touch-action` alone can't do it: the browser reads it at touch start, and by then
 * the drag doesn't exist yet (a long press arms it ~350ms in). Preventing `touchmove`
 * works mid-gesture, which is the case that matters here.
 *
 * No-op off web. Idempotent, because a drag can be begun twice — once when the hold
 * arms the row, once when the pan responder takes the gesture.
 */
let locked = false;
let prevUserSelect = '';
let prevCallout = '';

function blockTouchMove(e: TouchEvent) {
  if (e.cancelable) e.preventDefault();
}

export function lockDragGestures(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || locked) return;
  locked = true;
  // Passive listeners may not preventDefault, and the default for touchmove on
  // document is passive, so the flag has to be explicit.
  document.addEventListener('touchmove', blockTouchMove, { passive: false });

  const style = document.body.style as CSSStyleDeclaration & { webkitTouchCallout?: string };
  prevUserSelect = style.userSelect;
  prevCallout = style.webkitTouchCallout ?? '';
  style.userSelect = 'none';
  style.webkitTouchCallout = 'none';
  // A hold long enough to arm a drag may already have selected the word under it.
  document.getSelection()?.removeAllRanges();
}

export function unlockDragGestures(): void {
  if (!locked) return;
  locked = false;
  document.removeEventListener('touchmove', blockTouchMove);

  const style = document.body.style as CSSStyleDeclaration & { webkitTouchCallout?: string };
  style.userSelect = prevUserSelect;
  style.webkitTouchCallout = prevCallout;
}

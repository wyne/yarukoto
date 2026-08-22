import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GestureResponderEvent, GestureResponderHandlers, PanResponder } from 'react-native';
import { DragPayload, useDrag } from './DragContext';
import { Point } from './hitTest';
import { lockDragGestures, unlockDragGestures } from './webDragLock';
import { FINE_POINTER } from '../data/platform';

/**
 * How far a mouse must travel before it counts as dragging rather than clicking.
 * Small enough to feel immediate, wide enough that the shake in an ordinary
 * click never picks a row up.
 */
const MOUSE_DRAG_THRESHOLD = 5;

/**
 * Bindings for a draggable row: spread the responder + touch handlers onto a
 * wrapper View and wire `onLongPress` to the row's own Pressable.
 */
export interface DraggableBindings extends GestureResponderHandlers {
  /** Arms the drag. Wire to the row's Pressable onLongPress (~350ms). */
  onLongPress: (e: GestureResponderEvent) => void;
  /** Ends a pickup that never moved — spread onto the wrapper View. */
  onTouchEnd: () => void;
  onTouchCancel: () => void;
}

/**
 * Spread the returned handlers onto a wrapper around a row to make it draggable.
 *
 * On a touchscreen a drag is *armed* by the row's long press, never by touch down
 * or small movements, so the list keeps scrolling normally until a row is
 * deliberately picked up. Once armed, the next movement claims the pan responder
 * and the ghost follows the finger; a hold that goes nowhere is cleared by the
 * wrapper's touch-end handlers, and the browser's scroll/text-selection gestures
 * are locked out for the duration of the drag (web only).
 *
 * With a mouse the movement itself arms it, past a few pixels, which is how drag
 * works everywhere else on a desktop. Holding still does nothing no matter how
 * long — a click is a click — and scrolling is unaffected either way, being a
 * wheel gesture there.
 *
 * Claims on the **capture** phase (see PR #6). Responder negotiation runs
 * root-down in capture and deepest-first in bubble, so claiming in capture beats
 * any descendant that wants the same touch.
 *
 * That used to be what settled drag against SwipeableRow, whose swipe to Done is
 * the same mostly-sideways motion. It no longer is: the swipe is a
 * gesture-handler recognizer now, and a JS responder claim doesn't reach it. The
 * two are separated at the source instead — SwipeableRow disables itself while a
 * drag is in flight, which this hook announces by arming the drag on long press,
 * before any movement. Capture still earns its keep against everything else in
 * the responder system.
 */
export function useDraggable(payload: DragPayload): DraggableBindings {
  const { begin, move, end, cancel } = useDrag();
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const armedRef = useRef(false);
  // The ghost is anchored where the long press fired; grant/move deltas are then
  // applied on top. Without this the pill snaps to wherever the finger has slid
  // between the long press and the responder grant — a jump that varies with every
  // drag and makes the tooltip sit inconsistently relative to the thumb.
  const anchorRef = useRef<Point>({ x: 0, y: 0 });
  const grantRef = useRef<Point>({ x: 0, y: 0 });

  // Unmounting mid-hold skips the release handlers, and a lock left on would leave
  // the whole page unscrollable.
  useEffect(() => unlockDragGestures, []);

  const arm = useCallback(
    (e: GestureResponderEvent) => {
      armedRef.current = true;
      lockDragGestures();
      anchorRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      begin(payloadRef.current, anchorRef.current);
    },
    [begin]
  );

  // A drag can finish twice — once when the pan responder releases, once when the
  // wrapper's touch-end fires — so the armed flag makes the second call a no-op.
  const finish = useCallback(
    (commit: boolean) => {
      if (!armedRef.current) return;
      armedRef.current = false;
      unlockDragGestures();
      if (commit) end();
      else cancel();
    },
    [end, cancel]
  );

  return useMemo(
    () => ({
      onLongPress: arm,
      onTouchEnd: () => finish(true),
      onTouchCancel: () => finish(false),
      ...PanResponder.create({
        // Never claims on touch down, so the row's own Pressable still receives taps.
        onStartShouldSetPanResponderCapture: () => false,
        // Claims once the row is armed: by a long press on touch, or by the
        // movement itself with a mouse. Scrolling is untouched until then.
        onMoveShouldSetPanResponderCapture: (e, g) => {
          if (armedRef.current) return true;
          if (!FINE_POINTER) return false;
          if (Math.hypot(g.dx, g.dy) < MOUSE_DRAG_THRESHOLD) return false;
          arm(e);
          return true;
        },
        // Records the finger's position when the responder takes over, so move()
        // can turn subsequent positions into deltas from it — the ghost follows
        // the finger's motion, not its absolute spot.
        onPanResponderGrant: (_e, g) => {
          grantRef.current = { x: g.moveX, y: g.moveY };
        },
        onPanResponderMove: (_e, g) =>
          move({
            x: anchorRef.current.x + (g.moveX - grantRef.current.x),
            y: anchorRef.current.y + (g.moveY - grantRef.current.y),
          }),
        // A real mouse selects text as it sweeps across the row, and react-native-web
        // terminates the responder on selectionchange (also scroll / contextmenu)
        // unless termination is refused. Without this the ghost dies mid-drag.
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: () => finish(true),
        onPanResponderTerminate: () => finish(false),
      }).panHandlers,
    }),
    [arm, begin, finish, move]
  );
}

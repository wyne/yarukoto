import { useMemo, useRef } from 'react';
import { GestureResponderHandlers, PanResponder } from 'react-native';
import { DragPayload, useDrag } from './DragContext';

/** Movement before a press becomes a drag, so a plain tap still opens the task. */
const DRAG_THRESHOLD = 6;

/**
 * Spread the returned handlers onto a wrapper around a row to make it draggable.
 *
 * Never claims on touch down, only after {@link DRAG_THRESHOLD} of movement, so the
 * row's own Pressable still receives taps.
 *
 * Claims on the **capture** phase, which is the opposite of what DragList's handle
 * needs (see PR #6) and for the opposite reason. Responder negotiation runs
 * root-down in capture and deepest-first in bubble, so the phase to use is decided
 * by who you have to beat:
 *
 *   DragList handle  beats an *ancestor* Pressable            -> bubble
 *   this wrapper     beats a *descendant* SwipeableRow        -> capture
 *
 * Dragging a task from the pane to the calendar is mostly sideways, which is
 * exactly the gesture SwipeableRow treats as swipe-to-Done. Capture settles it in
 * the drag's favour; swipe still works everywhere the pane isn't.
 */
export function useDraggable(payload: DragPayload): GestureResponderHandlers {
  const { begin, move, end, cancel } = useDrag();
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.hypot(g.dx, g.dy) > DRAG_THRESHOLD,
        onPanResponderGrant: (_e, g) => begin(payloadRef.current, { x: g.moveX, y: g.moveY }),
        onPanResponderMove: (_e, g) => move({ x: g.moveX, y: g.moveY }),
        onPanResponderRelease: () => end(),
        onPanResponderTerminate: () => cancel(),
      }).panHandlers,
    [begin, move, end, cancel]
  );
}

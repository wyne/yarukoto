import { useDragSelector } from './DragContext';

/**
 * True while `taskId` is the task currently being dragged — the row to mark as
 * the drag source so the finger (and anyone watching) can see what's in flight.
 *
 * The source is highlighted by shading the item's own background (TaskRow /
 * week chip), never an outline: outlines are drawn outside the element where
 * dense lists clip them, while a background tint sits inside the item's own box.
 */
export function useDragSource(taskId: string): boolean {
  return useDragSelector((state) => state.payload?.taskId === taskId);
}

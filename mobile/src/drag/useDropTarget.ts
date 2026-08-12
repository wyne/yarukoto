import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { DragPayload, useDrag } from './DragContext';

interface DropTargetBinding {
  /** Attach to the target View, along with onLayout. */
  ref: React.RefObject<View | null>;
  onLayout: () => void;
  /** True while a drag is hovering this target — use it to highlight. */
  isOver: boolean;
}

/**
 * Registers a View as a drop zone. Rects are measured in window coordinates on
 * layout and again whenever a drag begins, since panes scroll and windows resize
 * between drags.
 */
export function useDropTarget(
  id: string,
  onDrop: (payload: DragPayload) => void,
  /**
   * Pass false on surfaces that render the same ids but can't accept drops. Tab
   * screens stay mounted, so a non-droppable copy would otherwise register the
   * same id with no rect and silently shadow the real target.
   */
  enabled = true
): DropTargetBinding {
  const { registerTarget, setTargetRect, overId } = useDrag();
  const ref = useRef<View | null>(null);

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => setTargetRect(id, { x, y, width, height }));
  }, [id, setTargetRect]);

  useEffect(() => {
    if (!enabled) return;
    return registerTarget(id, {
      rect: null,
      onDrop: (payload) => onDropRef.current(payload),
      measure,
    });
  }, [id, registerTarget, measure, enabled]);

  return { ref, onLayout: measure, isOver: overId === id };
}

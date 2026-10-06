import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { DragPayload, useDrag, useDragSelector } from './DragContext';
import { Point, Rect } from './hitTest';

interface DropTargetBinding {
  /** Attach to the target View, along with onLayout. */
  ref: React.RefObject<View | null>;
  onLayout: () => void;
  /** True while a drag is hovering this target — use it to highlight. */
  isOver: boolean;
}

/**
 * A host view that reports its window frame — both View and ScrollView refs
 * qualify at runtime, even though ScrollView's TS type doesn't list the method.
 */
export interface Measurable {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

/**
 * Registers a View as a drop zone. Rects are measured in window coordinates on
 * layout and again whenever a drag begins, since panes scroll and windows resize
 * between drags.
 *
 * When `clipTo` is set, only the part of the target inside that view's frame can
 * accept a drop. Scrolled-off list content stays mounted, so without a clip a
 * day group hidden above the viewport would keep swallowing drops meant for
 * whatever now paints over it (the month grid).
 */
export function useDropTarget(
  id: string,
  onDrop: (payload: DragPayload, point: Point, rect: Rect) => void,
  /**
   * Pass false on surfaces that render the same ids but can't accept drops. Tab
   * screens stay mounted, so a non-droppable copy would otherwise register the
   * same id with no rect and silently shadow the real target.
   */
  enabled = true,
  clipTo?: React.RefObject<Measurable | null> | null
): DropTargetBinding {
  const { registerTarget, setTargetRect } = useDrag();
  // Asks only about itself, so a drag crossing the grid re-renders the cell it
  // left and the cell it entered rather than all forty-two.
  const isOver = useDragSelector((state) => state.overId === id);
  const ref = useRef<View | null>(null);
  const clipRef = clipTo ?? null;

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      const clip = clipRef?.current;
      if (!clip) {
        setTargetRect(id, { x, y, width, height });
        return;
      }
      clip.measureInWindow((cx, cy, cw, ch) => {
        const nx = Math.max(x, cx);
        const ny = Math.max(y, cy);
        const nx2 = Math.min(x + width, cx + cw);
        const ny2 = Math.min(y + height, cy + ch);
        // A zero-size rect can never match, so a target scrolled fully out of the
        // clip quietly stops accepting drops without being unregistered.
        setTargetRect(
          id,
          nx2 <= nx || ny2 <= ny
            ? { x: nx, y: ny, width: 0, height: 0 }
            : { x: nx, y: ny, width: nx2 - nx, height: ny2 - ny }
        );
      });
    });
  }, [id, setTargetRect, clipRef]);

  useEffect(() => {
    if (!enabled) return;
    return registerTarget(id, {
      rect: null,
      onDrop: (payload, point, rect) => onDropRef.current(payload, point, rect),
      measure,
    });
  }, [id, registerTarget, measure, enabled]);

  return { ref, onLayout: measure, isOver };
}

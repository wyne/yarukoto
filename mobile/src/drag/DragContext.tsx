import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { Point, Rect, resolveDropTarget } from './hitTest';
import { hapticPickup, hapticTargetChange } from './haptics';

export interface DragPayload {
  taskId: string;
  title: string;
}

interface TargetEntry {
  rect: Rect | null;
  onDrop: (payload: DragPayload) => void;
  /** Re-reads the target's window rect; called again whenever a drag starts. */
  measure: () => void;
}

interface DragValue {
  payload: DragPayload | null;
  overId: string | null;
  /** Pointer position, animated so the ghost follows without re-rendering the tree. */
  pointer: Animated.ValueXY;
  begin: (payload: DragPayload, point: Point) => void;
  move: (point: Point) => void;
  end: () => void;
  cancel: () => void;
  registerTarget: (id: string, entry: TargetEntry) => () => void;
  setTargetRect: (id: string, rect: Rect) => void;
}

const DragContext = createContext<DragValue | null>(null);

/**
 * App-level drag layer. A drag starts in one pane and ends in another, so neither
 * pane can own it: this holds the payload, the pointer, and a registry of drop
 * targets keyed by id, and resolves which target the pointer is over.
 */
export function DragProvider({ children }: { children: React.ReactNode }) {
  const targets = useRef(new Map<string, TargetEntry>()).current;
  const pointer = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const overRef = useRef<string | null>(null);
  const payloadRef = useRef<DragPayload | null>(null);

  const [payload, setPayload] = useState<DragPayload | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const registerTarget = useCallback(
    (id: string, entry: TargetEntry) => {
      // Ids are registry keys, so a duplicate silently replaces the earlier target
      // and that surface quietly stops accepting drops. Scope ids per surface.
      if (__DEV__ && targets.has(id)) {
        console.warn(`[drag] duplicate drop target id "${id}" — the earlier one is now unreachable`);
      }
      targets.set(id, entry);
      return () => {
        targets.delete(id);
      };
    },
    [targets]
  );

  const setTargetRect = useCallback(
    (id: string, rect: Rect) => {
      const entry = targets.get(id);
      if (entry) entry.rect = rect;
    },
    [targets]
  );

  const begin = useCallback(
    (next: DragPayload, point: Point) => {
      // begin() runs twice per gesture — once when the long press arms the row,
      // once when the pan responder takes over — so only the first counts as the
      // pickup (and gets the haptic).
      const fresh = !payloadRef.current;
      // Rects go stale when panes scroll or the window resizes; refresh on every drag.
      targets.forEach((entry) => entry.measure());
      payloadRef.current = next;
      overRef.current = null;
      pointer.setValue({ x: point.x, y: point.y });
      setPayload(next);
      setOverId(null);
      if (fresh) hapticPickup();
    },
    [pointer, targets]
  );

  const move = useCallback(
    (point: Point) => {
      if (!payloadRef.current) return;
      pointer.setValue({ x: point.x, y: point.y });
      const list = [...targets.entries()].map(([id, entry]) => ({ id, rect: entry.rect }));
      const next = resolveDropTarget(list, point);
      if (next !== overRef.current) {
        // A tick on the way *onto* a target, not off it — entering is the moment
        // the finger has committed to somewhere new.
        if (next) hapticTargetChange();
        overRef.current = next;
        setOverId(next);
      }
    },
    [pointer, targets]
  );

  const finish = useCallback(
    (drop: boolean) => {
      const current = payloadRef.current;
      const over = overRef.current;
      payloadRef.current = null;
      overRef.current = null;
      setPayload(null);
      setOverId(null);
      if (drop && current && over) targets.get(over)?.onDrop(current);
    },
    [targets]
  );

  const end = useCallback(() => finish(true), [finish]);
  const cancel = useCallback(() => finish(false), [finish]);

  const value = useMemo<DragValue>(
    () => ({ payload, overId, pointer, begin, move, end, cancel, registerTarget, setTargetRect }),
    [payload, overId, pointer, begin, move, end, cancel, registerTarget, setTargetRect]
  );

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}

/**
 * Whether a drag is in flight, for components that only need to stand aside
 * while one is. Safe outside a DragProvider, unlike {@link useDrag}: a row can
 * be rendered somewhere no drag layer exists, and "no provider" is the same
 * answer as "not dragging" to a caller that only wants to know.
 */
export function useDragActive(): boolean {
  return useContext(DragContext)?.payload != null;
}

export function useDrag(): DragValue {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDrag must be used within a DragProvider');
  return ctx;
}

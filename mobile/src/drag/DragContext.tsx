import React, { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react';
import { Animated } from 'react-native';
import { Point, Rect, resolveDropTarget } from './hitTest';
import { hapticPickup, hapticTargetChange } from '../data/haptics';

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

/** Everything about a drag that changes while it is in flight. */
export interface DragState {
  payload: DragPayload | null;
  overId: string | null;
}

const IDLE: DragState = { payload: null, overId: null };

interface DragValue {
  /** Pointer position, animated so the ghost follows without re-rendering the tree. */
  pointer: Animated.ValueXY;
  begin: (payload: DragPayload, point: Point) => void;
  move: (point: Point) => void;
  end: () => void;
  cancel: () => void;
  registerTarget: (id: string, entry: TargetEntry) => () => void;
  setTargetRect: (id: string, rect: Rect) => void;
  subscribe: (listener: () => void) => () => void;
  getState: () => DragState;
}

const DragContext = createContext<DragValue | null>(null);

/**
 * App-level drag layer. A drag starts in one pane and ends in another, so neither
 * pane can own it: this holds the payload, the pointer, and a registry of drop
 * targets keyed by id, and resolves which target the pointer is over.
 *
 * The payload and the hovered target are held in a subscribable store rather than
 * React state, and the context value is fixed for the provider's life. It used to
 * be the other way round, and the cost was steep: the value changed identity on
 * every `setOverId`, React context has no selectors, and so crossing from one day
 * cell to the next re-rendered every consumer in the app — every drop target,
 * every draggable row, every SwipeableRow on the tab screens still mounted behind
 * this one, and CalendarScreen itself, which subscribed at the root of the screen
 * and dragged its whole subtree along. Several times a second, against the same
 * JS thread the ghost is being animated on.
 *
 * Now nothing re-renders for a change it doesn't read: see {@link useDragSelector}.
 */
export function DragProvider({ children }: { children: React.ReactNode }) {
  const targets = useRef(new Map<string, TargetEntry>()).current;
  const pointer = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const state = useRef<DragState>(IDLE);
  const listeners = useRef(new Set<() => void>()).current;

  // Snapshots are compared with Object.is, so the state object is replaced
  // wholesale rather than mutated — a selector reading `overId` off a mutated
  // object would see the new value with nothing to tell it the value had moved.
  const emit = useCallback(
    (next: DragState) => {
      state.current = next;
      listeners.forEach((listener) => listener());
    },
    [listeners]
  );

  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    [listeners]
  );

  const getState = useCallback(() => state.current, []);

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
      const fresh = !state.current.payload;
      // Rects go stale when panes scroll or the window resizes; refresh on every drag.
      targets.forEach((entry) => entry.measure());
      pointer.setValue({ x: point.x, y: point.y });
      emit({ payload: next, overId: null });
      if (fresh) hapticPickup();
    },
    [emit, pointer, targets]
  );

  const move = useCallback(
    (point: Point) => {
      const { payload, overId } = state.current;
      if (!payload) return;
      pointer.setValue({ x: point.x, y: point.y });
      // The registry is walked in place. Copying it into a list of {id, rect} ran
      // once per pointer event and threw away one object per target as it went.
      const next = resolveDropTarget(targets, point);
      if (next === overId) return;
      // A tick on the way *onto* a target, not off it — entering is the moment
      // the finger has committed to somewhere new.
      if (next) hapticTargetChange();
      emit({ payload, overId: next });
    },
    [emit, pointer, targets]
  );

  const finish = useCallback(
    (drop: boolean) => {
      const { payload, overId } = state.current;
      emit(IDLE);
      if (drop && payload && overId) targets.get(overId)?.onDrop(payload);
    },
    [emit, targets]
  );

  const end = useCallback(() => finish(true), [finish]);
  const cancel = useCallback(() => finish(false), [finish]);

  const value = useMemo<DragValue>(
    () => ({ pointer, begin, move, end, cancel, registerTarget, setTargetRect, subscribe, getState }),
    [pointer, begin, move, end, cancel, registerTarget, setTargetRect, subscribe, getState]
  );

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}

const noopSubscribe = () => () => {};
const idleState = () => IDLE;

/**
 * Subscribes to one fact about the drag, and re-renders only when that fact
 * changes. Two cells' `isOver` flip as the finger crosses a boundary; the other
 * forty read the same answer as before and stay put.
 *
 * `select` must return a primitive or an object that outlives the render —
 * snapshots are compared with Object.is, and a fresh object every call is an
 * infinite loop. It runs on every render and again on every notification, so
 * keep it to a comparison.
 *
 * Safe outside a DragProvider, where the answer is always the idle one: a row
 * can be rendered somewhere no drag layer exists, and "no provider" is the same
 * answer as "not dragging" to a caller that only wants to know.
 */
export function useDragSelector<T>(select: (state: DragState) => T): T {
  const ctx = useContext(DragContext);
  const subscribe = ctx?.subscribe ?? noopSubscribe;
  const getState = ctx?.getState ?? idleState;
  return useSyncExternalStore(subscribe, () => select(getState()));
}

const selectActive = (s: DragState) => s.payload !== null;
const selectPayload = (s: DragState) => s.payload;
const selectOverId = (s: DragState) => s.overId;

/** Whether a drag is in flight, for components that only stand aside during one. */
export function useDragActive(): boolean {
  return useDragSelector(selectActive);
}

/** The task in flight. For the ghost — a row wanting to know if it is the source
 *  should use `useDragSource`, which is a boolean and changes far less often. */
export function useDragPayload(): DragPayload | null {
  return useDragSelector(selectPayload);
}

/** The target under the pointer. For the ghost; a target should ask about itself. */
export function useDragOverId(): string | null {
  return useDragSelector(selectOverId);
}

/**
 * The imperative half: the pointer value and the callbacks. Fixed for the
 * provider's life, so reading it never costs a render.
 */
export function useDrag(): DragValue {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDrag must be used within a DragProvider');
  return ctx;
}

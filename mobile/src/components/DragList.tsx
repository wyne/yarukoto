import React, { useMemo, useRef, useState } from 'react';
import { Animated, GestureResponderHandlers, PanResponder, StyleSheet, View } from 'react-native';
import { useAccent } from '../theme/ThemeContext';
import { colors } from '../theme/colors';

/** Bindings a row must wire up to become draggable. */
export interface RowDragProps {
  /** Spread onto the grab handle; starts a drag as soon as the handle is touched. */
  handleProps?: GestureResponderHandlers;
  /** Wire to the row's long press; holding anywhere on the row arms a drag. */
  onLongPress?: () => void;
}

interface Props<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  /** Nothing starts a drag unless the row wires up one of the given bindings. */
  renderItem: (item: T, index: number, drag: RowDragProps) => React.ReactNode;
  /** Receives every key in its new order. */
  onReorder: (keys: string[]) => void;
  enabled: boolean;
}

/**
 * Reorderable column. A drag starts either from the row's grab handle or from a
 * long press anywhere on the row; taps, row swipes and list scrolling are left
 * alone until one of those happens.
 *
 * The dragged row floats under the pointer and an accent line marks where it will
 * land, rather than animating every other row out of the way — far less state to
 * keep in sync, and the drop target stays unambiguous.
 */
export default function DragList<T>({ items, keyExtractor, renderItem, onReorder, enabled }: Props<T>) {
  const accent = useAccent();
  const dragY = useRef(new Animated.Value(0)).current;
  const heights = useRef<number[]>([]);
  const dragRef = useRef<{ from: number; to: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  // A long press only *arms* the row: the drag itself begins on the next move, so
  // a hold that goes nowhere costs nothing but the lifted look.
  const armedRef = useRef<number | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const targetFor = (from: number, dy: number): number => {
    const h = heights.current;
    let top = 0;
    for (let i = 0; i < from; i++) top += h[i] ?? 0;
    const center = top + (h[from] ?? 0) / 2 + dy;

    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      const rowH = h[i] ?? 0;
      if (center < acc + rowH) return i;
      acc += rowH;
    }
    return items.length - 1;
  };

  const beginDrag = (index: number) => {
    dragY.setValue(0);
    dragRef.current = { from: index, to: index };
    setDrag(dragRef.current);
  };

  const moveDrag = (index: number, dy: number) => {
    dragY.setValue(dy);
    const to = targetFor(index, dy);
    if (dragRef.current && dragRef.current.to !== to) {
      dragRef.current = { from: index, to };
      setDrag(dragRef.current);
    }
  };

  const endDrag = (commit: boolean) => {
    const d = dragRef.current;
    if (commit && d && d.to !== d.from) {
      const keys = itemsRef.current.map(keyExtractor);
      const [moved] = keys.splice(d.from, 1);
      keys.splice(d.to, 0, moved);
      onReorder(keys);
    }
    armedRef.current = null;
    dragRef.current = null;
    setDrag(null);
    dragY.setValue(0);
  };

  const handleResponders = useMemo(
    () =>
      items.map((_, index) =>
        PanResponder.create({
          // Bubble phase, not capture: negotiation runs deepest-node-first, so the
          // handle beats the row Pressable it sits inside. Capture runs root-down,
          // which let the Pressable claim the gesture and swallowed every drag.
          onStartShouldSetPanResponder: () => enabled,
          onMoveShouldSetPanResponder: () => enabled,
          onPanResponderGrant: () => beginDrag(index),
          onPanResponderMove: (_e, g) => moveDrag(index, g.dy),
          onPanResponderRelease: () => endDrag(true),
          onPanResponderTerminate: () => endDrag(false),
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, enabled]
  );

  const rowResponders = useMemo(
    () =>
      items.map((_, index) =>
        PanResponder.create({
          // Capture phase this time: once the hold has armed the row, the drag has to
          // outrank the swipe handler nested inside it, which capture (root-down) does.
          onMoveShouldSetPanResponderCapture: () => enabled && armedRef.current === index,
          onPanResponderGrant: () => beginDrag(index),
          onPanResponderMove: (_e, g) => moveDrag(index, g.dy),
          onPanResponderRelease: () => endDrag(true),
          onPanResponderTerminate: () => endDrag(false),
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, enabled]
  );

  // A hold that never turns into a move ends here: the touch handlers fire whether or
  // not the pan responder ever took over, so the row can't stay stuck in its lifted state.
  const releaseRow = (index: number) => {
    if (armedRef.current === index || dragRef.current?.from === index) endDrag(false);
  };

  return (
    <View>
      {items.map((item, i) => {
        const dragging = drag?.from === i;
        const isTarget = !!drag && drag.to === i && drag.from !== i;
        return (
          <Animated.View
            key={keyExtractor(item)}
            onLayout={(e) => {
              heights.current[i] = e.nativeEvent.layout.height;
            }}
            style={dragging ? [styles.dragging, { transform: [{ translateY: dragY }] }] : undefined}
            onTouchEnd={() => releaseRow(i)}
            onTouchCancel={() => releaseRow(i)}
            {...(enabled ? rowResponders[i].panHandlers : {})}
          >
            {renderItem(item, i, {
              handleProps: enabled ? handleResponders[i].panHandlers : undefined,
              onLongPress: enabled
                ? () => {
                    armedRef.current = i;
                    beginDrag(i);
                  }
                : undefined,
            })}
            {isTarget && (
              <View
                style={[
                  styles.indicator,
                  { backgroundColor: accent },
                  drag!.to < drag!.from ? styles.indicatorTop : styles.indicatorBottom,
                ]}
              />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dragging: {
    zIndex: 20,
    elevation: 8,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    opacity: 0.97,
  },
  indicator: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 1,
  },
  indicatorTop: {
    top: 0,
  },
  indicatorBottom: {
    bottom: 0,
  },
});

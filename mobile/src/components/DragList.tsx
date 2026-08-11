import React, { useMemo, useRef, useState } from 'react';
import { Animated, GestureResponderHandlers, PanResponder, StyleSheet, View } from 'react-native';
import { useAccent } from '../theme/ThemeContext';
import { colors } from '../theme/colors';

interface Props<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  /** `handleProps` must be spread onto whatever grabs the row; nothing else starts a drag. */
  renderItem: (item: T, index: number, handleProps: GestureResponderHandlers | undefined) => React.ReactNode;
  /** Receives every key in its new order. */
  onReorder: (keys: string[]) => void;
  enabled: boolean;
}

/**
 * Reorderable column driven by a per-row drag handle. Only the handle claims the
 * gesture, so taps, row swipes and list scrolling keep working untouched.
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

  const responders = useMemo(
    () =>
      items.map((_, index) =>
        PanResponder.create({
          // Bubble phase, not capture: negotiation runs deepest-node-first, so the
          // handle beats the row Pressable it sits inside. Capture runs root-down,
          // which let the Pressable claim the gesture and swallowed every drag.
          onStartShouldSetPanResponder: () => enabled,
          onMoveShouldSetPanResponder: () => enabled,
          onPanResponderGrant: () => {
            dragY.setValue(0);
            dragRef.current = { from: index, to: index };
            setDrag(dragRef.current);
          },
          onPanResponderMove: (_e, g) => {
            dragY.setValue(g.dy);
            const to = targetFor(index, g.dy);
            if (dragRef.current && dragRef.current.to !== to) {
              dragRef.current = { from: index, to };
              setDrag(dragRef.current);
            }
          },
          onPanResponderRelease: () => {
            const d = dragRef.current;
            if (d && d.to !== d.from) {
              const keys = itemsRef.current.map(keyExtractor);
              const [moved] = keys.splice(d.from, 1);
              keys.splice(d.to, 0, moved);
              onReorder(keys);
            }
            dragRef.current = null;
            setDrag(null);
            dragY.setValue(0);
          },
          onPanResponderTerminate: () => {
            dragRef.current = null;
            setDrag(null);
            dragY.setValue(0);
          },
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, enabled]
  );

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
          >
            {renderItem(item, i, enabled ? responders[i].panHandlers : undefined)}
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

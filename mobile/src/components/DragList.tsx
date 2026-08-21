import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import Sortable, { useItemContext } from 'react-native-sortables';

interface Props<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  /**
   * Renders one row. No drag bindings needed: the Sortable.Flex below owns the
   * long-press-to-drag gesture and slides the other rows out of the way, leaving
   * an empty slot where the row will land — no line indicator.
   */
  renderItem: (item: T, index: number) => React.ReactNode;
  /**
   * Fires only when the order actually changed. `keys` is the whole new sequence;
   * `moved` names the dragged item and the two it came to rest between, which is
   * all a single-item reorder needs to write.
   */
  onReorder: (keys: string[], moved: { id: string; prevId: string | null; nextId: string | null }) => void;
  /** When false the list is not draggable and behaves like a plain column. */
  enabled: boolean;
  /** Animated.ScrollView hosting this list; enables auto-scroll while dragging. */
  scrollableRef?: AnimatedRef<Animated.ScrollView>;
}

/**
 * Reorderable column. Holding a row (~200ms) lifts it and starts the drag; the
 * other rows part to show the empty slot where it will land, the lifted row is
 * dressed in the glass pane look, and the list auto-scrolls near its edges.
 *
 * Haptics and auto-scroll come from the library (expo-haptics is already a
 * dependency). The row's own Pressable still wins taps, because the drag only
 * activates on a hold that doesn't move past `dragActivationFailOffset`.
 */
export default function DragList<T>({ items, keyExtractor, renderItem, onReorder, enabled, scrollableRef }: Props<T>) {
  // The library sizes rows from their own content once it switches the column to
  // absolute layout (see applyControlledContainerDimensions in MeasurementsProvider),
  // so rows must carry an explicit width. Measure the column and pass it down.
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // Both spellings, so this keeps working if the library ever reports raw keys.
  const keyMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of items) {
      const key = keyExtractor(item);
      m.set(key, key);
      m.set(`.$${key}`, key);
    }
    return m;
  }, [items, keyExtractor]);

  return (
    <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      <Sortable.Flex
        flexDirection="column"
        flexWrap="nowrap"
        // The library defaults to `flex-start` (so dragged items keep their
        // measured size) and even excludes `stretch` from its type, but it does
        // pass the value through — stretch every row to the full card width.
        alignItems={'stretch' as never}
        sortEnabled={enabled}
        scrollableRef={scrollableRef}
        activeItemScale={1.03}
        activeItemOpacity={0.95}
        // The lifted row's shadow comes from the glass veil below (boxShadow works
        // on iOS, Android and web), so the library's iOS-only shadow stays off.
        activeItemShadowOpacity={0}
        inactiveItemOpacity={0.45}
        hapticsEnabled
        onDragEnd={(params) => {
          // The library reports React's child keys, which React mangles to '.$<key>'
          // for keyed array children. Map them back before anything downstream tries
          // to match them against task ids.
          const unwrap = (k: string) => keyMap.get(k) ?? k;
          const next = params.indexToKey.map(unwrap);
          const prev = items.map(keyExtractor);
          if (next.join('\u0000') === prev.join('\u0000')) return;
          onReorder(next, {
            id: unwrap(params.key),
            prevId: next[params.toIndex - 1] ?? null,
            nextId: next[params.toIndex + 1] ?? null,
          });
        }}
      >
        {items.map((item, index) => (
          <GlassRow key={keyExtractor(item)} width={containerWidth}>
            {renderItem(item, index)}
          </GlassRow>
        ))}
      </Sortable.Flex>
    </View>
  );
}

/**
 * The glass pane: while its item is being dragged a hairline edge and a soft
 * shadow fade in over the row. The veil is an absolute-fill overlay so it never
 * shifts the layout, and `pointerEvents="none"` keeps taps and swipes intact.
 */
function GlassRow({ children, width }: { children: React.ReactNode; width: number | null }) {
  const { activationAnimationProgress } = useItemContext();

  const veil = useAnimatedStyle(() => ({
    opacity: activationAnimationProgress.value,
  }));

  return (
    <View style={[styles.glass, width !== null && { width }]}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.veil, veil]} />
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    position: 'relative',
  },
  veil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.07)',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.14)',
  },
});

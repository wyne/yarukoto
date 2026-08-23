import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import Sortable, { useItemContext } from 'react-native-sortables';
import { FINE_POINTER } from '../data/platform';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { IconGrip } from '../icons/Icons';

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
  /**
   * How many rows this drag is carrying, given the one being held. Above one it
   * is shown on the lifted row: the library drags a single item, so the rest of
   * a selection stays put until the drop, and the count is what says they are
   * coming too.
   */
  dragCount?: (key: string) => number;
  /** Animated.ScrollView hosting this list; enables auto-scroll while dragging. */
  scrollableRef?: AnimatedRef<Animated.ScrollView>;
  /** The hold was recognised and the row is lifting. */
  onDragStart?: (key: string) => void;
  /** The lifted row has moved. `point` is the current touch, in window coordinates. */
  onDragMove?: (key: string, point: { x: number; y: number }) => void;
  /**
   * Hold the lift back until the finger has travelled this far, in points.
   *
   * For rows where the hold means two things. A hold that opens a menu has not
   * yet said which of the two it is, and lifting the row straight away answers
   * for the user — it reads as "you are dragging this", under a menu asking them
   * to choose. Deferring the lift until the finger commits to travelling keeps
   * the row still while the menu is the subject, and hands it over the moment it
   * is not.
   *
   * Unset lifts on activation, which is right where the hold means only one
   * thing: the lift is the whole confirmation that the row has been grabbed.
   */
  liftAfter?: number;
  /** The finger passed `liftAfter` — this is a drag now, not a hold. */
  onLift?: (key: string) => void;
  /**
   * The drag is over, whether or not it changed the order.
   *
   * Separate from `onReorder`, which stays silent when a row is put back where
   * it came from. Anything armed for the duration of a drag has to be disarmed
   * on every ending, not just the ones that wrote something.
   */
  onDragEnd?: () => void;
  /**
   * Remounts the sortable when this changes.
   *
   * For callers that show and hide rows under keys they reuse — a collapsing
   * tree. The library tracks which items it has measured in a set that is
   * added to and deleted from on the UI thread, from two different places: an
   * item's own layout, and its unmount cleanup. When the same key leaves and
   * returns quickly, the delete can land after the add, and from then on the set
   * never matches the item count, so measurements stop being applied and the
   * rows sit at stale positions until some unrelated re-layout shakes it loose.
   *
   * Remounting hands it a clean context instead. Key this on what actually hides
   * rows, not on the rows themselves: adding or deleting one brings a genuinely
   * new key, which the library handles, and reordering must never remount.
   */
  resetKey?: string;
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
export default function DragList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  enabled,
  dragCount,
  scrollableRef,
  onDragStart,
  onDragMove,
  liftAfter,
  onLift,
  onDragEnd,
  resetKey,
}: Props<T>) {
  // Which row is lifted, so only that one carries the count.
  const [activeKey, setActiveKey] = useState<string | null>(null);

  /**
   * How lifted the active row is: 0 flat, 1 fully raised.
   *
   * A shared value rather than state because the library's decoration props
   * accept one, so the whole lift — its scale, both opacities and the glass
   * veil — animates on the UI thread off this single number.
   */
  const lift = useSharedValue(liftAfter === undefined ? 1 : 0);
  // Where the finger was when the drag was claimed, to measure travel against.
  const origin = useRef<{ x: number; y: number } | null>(null);
  const lifted = useRef(liftAfter === undefined);

  const raise = (key: string) => {
    if (lifted.current) return;
    lifted.current = true;
    lift.value = withTiming(1, { duration: 180 });
    onLift?.(key);
  };

  // Scaled from `lift` so the row rises into the drag rather than appearing in
  // it. The numbers are the library's defaults at full lift.
  const activeScale = useDerivedValue(() => 1 + 0.03 * lift.value);
  const activeOpacity = useDerivedValue(() => 1 - 0.05 * lift.value);
  const inactiveOpacity = useDerivedValue(() => 1 - 0.55 * lift.value);
  // The library sizes rows from their own content once it switches the column to
  // absolute layout (see applyControlledContainerDimensions in MeasurementsProvider),
  // so rows must carry an explicit width. Measure the column and pass it down.
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // The library reports React's own child keys, and React rewrites the ones it
  // is given: a keyed array child becomes `.$<key>` with `=` and `:` escaped to
  // `=0` and `=2`. So `l:l-home` arrives as `.$l=2l-home`.
  //
  // Reproducing that escaping is what makes a key with punctuation in it — the
  // sidebar's `f:`/`l:` prefixes, say — survive the round trip. Guessing wrong
  // fails silently: every lookup misses, and a drag appears to work while
  // nothing is written. Every spelling is registered, so this also keeps working
  // if the library ever reports raw keys.
  const keyMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of items) {
      const key = keyExtractor(item);
      m.set(key, key);
      m.set(`.$${key}`, key);
      m.set(`.$${key.replace(/[=:]/g, (c) => (c === '=' ? '=0' : '=2'))}`, key);
    }
    return m;
  }, [items, keyExtractor]);

  return (
    <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      <Sortable.Flex
        key={resetKey}
        flexDirection="column"
        flexWrap="nowrap"
        // The library defaults to `flex-start` (so dragged items keep their
        // measured size) and even excludes `stretch` from its type, but it does
        // pass the value through — stretch every row to the full card width.
        alignItems={'stretch' as never}
        sortEnabled={enabled}
        // Locks the lifted row to the vertical axis. Rows are stretched to the
        // container's width, so clamping x to `containerWidth - itemWidth`
        // clamps it to zero — the row cannot drift sideways at all.
        //
        // 'vertical' rather than 'none': vertical over-drag has to stay allowed
        // so the row can be pulled past the top or bottom edge, which is what
        // auto-scroll follows on a long list.
        overDrag="vertical"
        // With a mouse the row is grabbed by a handle, so a drag starts on the
        // movement itself. No hold is needed and none of it can be confused
        // with a click, because the handle is the only thing that starts a drag
        // and it does nothing else. Zero delay is safe for the same reason.
        //
        // Touch keeps the whole row and the hold: there is no hover to reveal a
        // handle with, and the hold is what separates a drag from a scroll.
        customHandle={FINE_POINTER}
        dragActivationDelay={FINE_POINTER ? 0 : undefined}
        scrollableRef={scrollableRef}
        // Snapping is what re-centres the row under the finger on pickup, and
        // it is interpolated by the library's own activation progress — so it
        // moves even with every other decoration held back, which is exactly the
        // twitch a deferred lift is trying to avoid.
        //
        // Off entirely rather than deferred: the interpolation is already
        // finished by the time the threshold is crossed, so switching it on then
        // would teleport the row to centre rather than glide to it. Left off, the
        // row simply keeps the offset it was grabbed at — which is what a UIKit
        // table view does when you reorder one.
        enableActiveItemSnap={liftAfter === undefined}
        activeItemScale={activeScale}
        activeItemOpacity={activeOpacity}
        // The lifted row's shadow comes from the glass veil below (boxShadow works
        // on iOS, Android and web), so the library's iOS-only shadow stays off.
        activeItemShadowOpacity={0}
        inactiveItemOpacity={inactiveOpacity}
        hapticsEnabled
        reorderTriggerOrigin="touch"
        onDragStart={(params) => {
          const key = keyMap.get(params.key) ?? params.key;
          setActiveKey(key);
          origin.current = null;
          if (liftAfter === undefined) {
            lifted.current = true;
            lift.value = 1;
          } else {
            lifted.current = false;
            lift.value = 0;
          }
          onDragStart?.(key);
        }}
        onDragMove={(params) => {
          const { absoluteX, absoluteY } = params.touchData;
          const key = keyMap.get(params.key) ?? params.key;
          // Measured from the first sample after the drag was claimed, which
          // lands within a frame of the touch that claimed it. `onDragMove`
          // only fires on movement, so a hold that never moves never lifts —
          // which is the behaviour this exists for.
          origin.current ??= { x: absoluteX, y: absoluteY };
          if (liftAfter !== undefined) {
            const { x, y } = origin.current;
            if (Math.hypot(absoluteX - x, absoluteY - y) > liftAfter) raise(key);
          }
          onDragMove?.(key, { x: absoluteX, y: absoluteY });
        }}
        onDragEnd={(params) => {
          setActiveKey(null);
          onDragEnd?.();
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
          <GlassRow
            key={keyExtractor(item)}
            width={containerWidth}
            handle={enabled && FINE_POINTER}
            count={activeKey === keyExtractor(item) ? dragCount?.(keyExtractor(item)) ?? 1 : 1}
            lift={lift}
          >
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
function GlassRow({
  children,
  width,
  handle,
  count,
  lift,
}: {
  children: React.ReactNode;
  width: number | null;
  /** See DragList's `liftAfter`: gates the veil so it fades in with the lift. */
  lift: SharedValue<number>;
  /** Render the drag handle, revealed while a pointer is over the row. */
  handle: boolean;
  /** Rows this drag is carrying. Shown on the lifted row when above one. */
  count: number;
}) {
  const { activationAnimationProgress } = useItemContext();
  const ref = useRef<View>(null);
  const [hovered, setHovered] = useState(false);

  // Listened for on the host node: the row's own hover lives on a Pressable
  // further in, and the handle deliberately sits outside it.
  useEffect(() => {
    if (!handle) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    node.addEventListener('pointerenter', enter);
    node.addEventListener('pointerleave', leave);
    return () => {
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointerleave', leave);
    };
  }, [handle]);

  const veil = useAnimatedStyle(() => ({
    opacity: activationAnimationProgress.value * lift.value,
  }));

  return (
    <View ref={ref} style={[styles.glass, width !== null && { width }]}>
      {children}
      {/*
        Outside the row's Pressable on purpose. Nested inside it, a press on the
        handle reaches the row and opens the task — and inside SwipeableRow it
        would be competing with that gesture for the same touch.
      */}
      {handle && hovered && (
        <View style={styles.handleSlot}>
          <Sortable.Handle>
            <View style={styles.handle} accessibilityLabel="Drag to reorder">
              <IconGrip />
            </View>
          </Sortable.Handle>
        </View>
      )}
      {count > 1 && (
        <View pointerEvents="none" style={styles.count}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
      <Animated.View pointerEvents="none" style={[styles.veil, veil]} />
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    position: 'relative',
  },
  /** Sits over the row's trailing edge, only while the pointer is on the row. */
  handleSlot: {
    position: 'absolute',
    right: 2,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  handle: {
    paddingHorizontal: 5,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surface,
    // Web-only. `touchAction: none` matters most: a gesture starting on the
    // handle only ever drags, so the browser must hand the whole thing over.
    ...({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as object),
  },
  /** Clear of the grip, which sits at the trailing edge. */
  count: {
    position: 'absolute',
    right: 34,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  countText: {
    overflow: 'hidden',
    minWidth: 20,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.textPrimary,
    color: '#fff',
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
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

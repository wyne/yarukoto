import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { colors } from '../theme/colors';
import { useDragActive } from '../drag/DragContext';
import { hapticAction } from '../data/haptics';
import { IconCalendarBox, IconCheckBig } from '../icons/Icons';

const ACTION_WIDTH = 66;

/**
 * How far the row must be left when the finger lifts for it to stay open. Well
 * under half the travel, because the library adds the fling: a throw that has
 * only covered 40pt but is still moving fast lands open, and a slow drag past
 * 40pt does too.
 */
const OPEN_THRESHOLD = 40;

/**
 * Sideways movement before the swipe takes the gesture from the scroll view.
 * Low enough to feel like it starts under the finger, high enough that the
 * diagonal drift at the start of a vertical flick never trips it.
 */
const EDGE_OFFSET = 15;

/**
 * The row currently showing its actions, app-wide.
 *
 * One row open at a time is the point: rows left open behind you are the state
 * the old implementation used to get stuck in. Kept as a module-level ref rather
 * than context because nothing renders off it — it is only ever read to close
 * the previous row.
 */
let openRow: SwipeableMethods | null = null;

/** Closes whichever row is open. For scroll, navigation and mode changes. */
export function closeOpenSwipeRow() {
  openRow?.close();
  openRow = null;
}

interface Props {
  children: React.ReactNode;
  onLater: () => void;
  onDone: () => void;
  disabled?: boolean;
}

/**
 * Swipe a row left to reveal Later and Done.
 *
 * Built on gesture-handler's swipeable rather than a PanResponder: the row also
 * sits inside a scroll view and a reorderable list, and a JS-thread responder
 * can't arbitrate with either of those — they are native recognizers, so the two
 * systems race instead of negotiating. Here the pan is a gesture-handler
 * recognizer like theirs, which is what makes `EDGE_OFFSET` an actual handoff
 * rather than a guess, and what keeps a stolen gesture from stranding the row
 * half-open.
 *
 * Touch-only, by the caller's gating: with a mouse this is the same sideways
 * motion as dragging a row somewhere, and the context menu already offers both
 * actions.
 */
export default function SwipeableRow({ children, onLater, onDone, disabled }: Props) {
  const rowRef = useRef<SwipeableMethods>(null);
  // A cross-pane drag is armed by holding the row, and moving off with it is
  // also sideways. The drag wins outright while it is in flight.
  const dragging = useDragActive();

  const forget = useCallback(() => {
    if (openRow === rowRef.current) openRow = null;
  }, []);

  // Unmounting while open — completing the task from its own action does exactly
  // this — would otherwise leave the registry pointing at a dead row.
  useEffect(() => forget, [forget]);

  const claim = useCallback(() => {
    if (openRow && openRow !== rowRef.current) openRow.close();
    openRow = rowRef.current;
  }, []);

  // Action first, close second: the tap is a request to do the thing, and
  // nothing about shutting the row should be able to get in the way of it.
  const runAction = useCallback((fn: () => void) => {
    hapticAction();
    fn();
    rowRef.current?.close();
  }, []);

  /*
   * React Native's Pressable, not gesture-handler's.
   *
   * Gesture-handler's is built on `Gesture.Native()` wrapping a native button,
   * and nested inside the swipeable's own pan detector that button never sees
   * the tap: the actions draw, and pressing them does nothing. The
   * responder-system Pressable has no such quarrel with an ancestor recognizer.
   *
   * (Gesture-handler deprecates its own TouchableOpacity in favour of its
   * Pressable, which is what led here. A deprecation notice is not worth a dead
   * button.)
   */
  const actions = useCallback(
    () => (
      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.action, { backgroundColor: colors.swipeLater }]}
          onPress={() => runAction(onLater)}
        >
          <IconCalendarBox size={18} color="#fff" strokeWidth={1.6} />
          <Text style={styles.actionLabel}>Later</Text>
        </Pressable>
        <Pressable
          style={[styles.action, { backgroundColor: colors.swipeDone }]}
          onPress={() => runAction(onDone)}
        >
          <IconCheckBig size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.actionLabel}>Done</Text>
        </Pressable>
      </View>
    ),
    [onDone, onLater, runAction]
  );

  return (
    <ReanimatedSwipeable
      ref={rowRef}
      enabled={!disabled && !dragging}
      renderRightActions={actions}
      rightThreshold={OPEN_THRESHOLD}
      dragOffsetFromRightEdge={EDGE_OFFSET}
      // Nothing lives past the two actions, so there is nothing to stretch into.
      overshootRight={false}
      onSwipeableWillOpen={claim}
      onSwipeableWillClose={forget}
      containerStyle={styles.container}
      childrenContainerStyle={styles.foreground}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.chipBg,
  },
  actionsRow: {
    flexDirection: 'row',
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  foreground: {
    backgroundColor: colors.surface,
  },
});

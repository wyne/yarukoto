import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useColors } from '../theme/ThemeContext';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { makeMutable, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { makeStyles } from '../theme/styles';
import { useDragActive } from '../drag/DragContext';
import { hapticAction } from '../data/haptics';
import { IconCalendarBox, IconCheckBig, IconClock } from '../icons/Icons';

/**
 * Narrower than the two actions were, so that three of them still leave enough
 * of the row to read while they are out. Well clear of a 44pt touch target, and
 * `OPEN_THRESHOLD` is measured against the finger rather than against this, so
 * the swipe itself feels exactly as it did.
 */
const ACTION_WIDTH = 58;
const ACTIONS_WIDTH = ACTION_WIDTH * 3;

/** How much of the fling's speed counts toward where the row lands. */
const DRAG_TOSS = 0.05;

/** Settles without bouncing past where it is going. */
const SPRING = { mass: 2, damping: 1000, stiffness: 700, overshootClamping: true };

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
 * Far enough that a rightward drag never becomes the row's.
 *
 * The swipeable arms both directions from one pair of thresholds
 * (`activeOffsetX([-dragOffsetFromRightEdge, dragOffsetFromLeftEdge])`), and the
 * rightward one defaults to 10 points whether or not there is anything over
 * there to reveal. There is not — these rows only open leftwards — so all that
 * claim did was take the gesture from the nav, which opens on a rightward drag
 * anywhere in the list, and being the nearer handler the row won every time.
 *
 * Shutting an open row by dragging it back is not lost: the nav's own gesture
 * recognises that case and closes the row instead of pulling itself out.
 */
const NEVER_FROM_LEFT = 10000;

/**
 * The row currently showing its actions, app-wide.
 *
 * One row open at a time is the point: rows left open behind you are the state
 * the old implementation used to get stuck in. Kept as a module-level ref rather
 * than context because nothing renders off it — it is only ever read to close
 * the previous row.
 */
let openRow: { close: () => void } | null = null;

/**
 * The same fact as `openRow`, in a form the UI thread can read.
 *
 * For the swipe that opens the nav: it takes a rightward drag anywhere in the
 * list, which is exactly the drag that shuts an open row. A gesture on the UI
 * thread cannot ask a module variable, so the answer is kept somewhere it can.
 */
export const swipeRowOpen = makeMutable(false);

/** Closes whichever row is open. For scroll, navigation and mode changes. */
export function closeOpenSwipeRow() {
  openRow?.close();
  openRow = null;
  swipeRowOpen.value = false;
}

interface Props {
  children: React.ReactNode;
  onToday: () => void;
  onLater: () => void;
  onDone: () => void;
  disabled?: boolean;
}

/**
 * Swipe a row left to reveal Today, Tmrw and Done.
 *
 * The two dates read as the days they set rather than as directions to push the
 * task in: "Later" was already tomorrow and nothing else, so naming it that is
 * only saying what the tap has always done. Today sits before it because a row
 * you are already looking at is more often due now than deferred, and because
 * the pair then reads left to right in the order the days fall in.
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
 * motion as dragging a row somewhere, and the context menu already offers all
 * three actions.
 */
export default function SwipeableRow({ children, onToday, onLater, onDone, disabled }: Props) {
  const colors = useColors();
  const styles = useStyles();
  // A cross-pane drag is armed by holding the row, and moving off with it is
  // also sideways. The drag wins outright while it is in flight.
  const dragging = useDragActive();

  /*
   * Built by hand rather than on gesture-handler's ReanimatedSwipeable.
   *
   * Every row carries one of these, and almost none is ever swiped. The
   * library's version costs each of them several animated wrappers, a second
   * gesture for tap-to-close, a layout measurement and four animated styles —
   * a large share of what building a screenful of rows cost. The actions here
   * are a fixed width, so nothing needs measuring: a row at rest is one pan
   * recognizer and two views, and the actions are only built once a swipe
   * starts, well before the first of them is uncovered.
   */
  const translate = useSharedValue(0);
  const startX = useSharedValue(0);
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const self = useRef<{ close: () => void } | null>(null);

  const forget = useCallback(() => {
    setOpen(false);
    if (openRow !== self.current) return;
    openRow = null;
    swipeRowOpen.value = false;
  }, []);

  const close = useCallback(() => {
    translate.value = withSpring(0, SPRING);
    forget();
  }, [forget, translate]);
  self.current ??= { close: () => close() };

  // Unmounting while open — completing the task from its own action does exactly
  // this — would otherwise leave the registry pointing at a dead row.
  useEffect(() => forget, [forget]);

  const claim = useCallback(() => {
    if (openRow && openRow !== self.current) openRow.close();
    openRow = self.current;
    swipeRowOpen.value = true;
    setOpen(true);
  }, []);

  const arm = useCallback(() => setArmed(true), []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && !dragging)
        .activeOffsetX([-EDGE_OFFSET, NEVER_FROM_LEFT])
        .onStart(() => {
          startX.value = translate.value;
          scheduleOnRN(arm);
        })
        .onUpdate((e) => {
          translate.value = Math.min(0, Math.max(-ACTIONS_WIDTH, startX.value + e.translationX));
        })
        .onEnd((e) => {
          // Measured against the finger, not the row, so a throw that has only
          // covered a little ground but is still moving lands open.
          const travel = e.translationX + DRAG_TOSS * e.velocityX;
          const opening = startX.value === 0 ? travel < -OPEN_THRESHOLD : travel < OPEN_THRESHOLD;
          const to = opening ? -ACTIONS_WIDTH : 0;
          translate.value = withSpring(to, { ...SPRING, velocity: e.velocityX });
          scheduleOnRN(opening ? claim : forget);
        }),
    [arm, claim, disabled, dragging, forget, startX, translate]
  );

  const foreground = useAnimatedStyle(() => ({ transform: [{ translateX: translate.value }] }));

  // Action first, close second: the tap is a request to do the thing, and
  // nothing about shutting the row should be able to get in the way of it.
  const runAction = (fn: () => void) => {
    hapticAction();
    fn();
    close();
  };

  /*
   * React Native's Pressable, not gesture-handler's.
   *
   * Gesture-handler's is built on `Gesture.Native()` wrapping a native button,
   * and nested inside the swipeable's own pan detector that button never sees
   * the tap: the actions draw, and pressing them does nothing. The
   * responder-system Pressable has no such quarrel with an ancestor recognizer.
   */
  return (
    <GestureDetector gesture={pan} touchAction="pan-y">
      <View style={styles.container}>
        {armed && (
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.action, { backgroundColor: colors.swipeToday }]}
              onPress={() => runAction(onToday)}
            >
              <IconClock size={18} color="#fff" strokeWidth={1.7} />
              <Text style={styles.actionLabel}>Today</Text>
            </Pressable>
            <Pressable
              style={[styles.action, { backgroundColor: colors.swipeLater }]}
              onPress={() => runAction(onLater)}
            >
              <IconCalendarBox size={18} color="#fff" strokeWidth={1.6} />
              <Text style={styles.actionLabel}>Tmrw</Text>
            </Pressable>
            <Pressable
              style={[styles.action, { backgroundColor: colors.swipeDone }]}
              onPress={() => runAction(onDone)}
            >
              <IconCheckBig size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.actionLabel}>Done</Text>
            </Pressable>
          </View>
        )}
        <Animated.View style={[styles.foreground, foreground]}>
          {children}
          {/* An open row shuts on a tap anywhere on it, instead of opening the task. */}
          {open && <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close actions" />}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const useStyles = makeStyles((c) => ({
  container: {
    backgroundColor: c.chipBg,
  },
  /** Behind the row, at its trailing edge, uncovered as the row slides away. */
  actionsRow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
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
    backgroundColor: c.surface,
  },
}));

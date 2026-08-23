import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { FullWindowOverlay } from 'react-native-screens';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSidebar } from '../navigation/SidebarContext';
import Sidebar, { SIDEBAR_WIDTH } from './Sidebar';

/**
 * iOS hosts the drawer in a window-level overlay; everywhere else it is a Modal.
 *
 * The overlay is the reason this component can feel immediate. A Modal is a view
 * controller, and presenting one is asynchronous — the drawer could not start
 * moving until the platform had finished putting it on screen, which is why the
 * old version appeared already open. `FullWindowOverlay` is just a view in
 * another window: it is mounted for the life of the app, so opening is nothing
 * but an animation starting.
 *
 * Keeping it mounted also keeps `Sidebar` mounted, and with it the sortable tree
 * the nav is built on, which used to be rebuilt on every open.
 *
 * It is safe to leave up because the overlay only claims a touch that lands on
 * an interactive subview of its own (see `pointInside` in
 * RNSFullWindowOverlay.mm). Closed, the backdrop is `pointerEvents: none` and
 * the panel is translated off screen, so every touch falls through to the app.
 */
const IOS = Platform.OS === 'ios';

/**
 * Opening decelerates and closing accelerates, rather than easing at both ends.
 *
 * A panel arriving under your thumb should look like it is being caught, and one
 * leaving like it is being let go. Symmetric easing gives both halves the same
 * hesitant start, which reads as the drawer thinking about it.
 */
const OPEN_MS = 280;
const CLOSE_MS = 220;
const OPEN_EASING = Easing.out(Easing.cubic);
const CLOSE_EASING = Easing.in(Easing.cubic);

const BACKDROP_OPACITY = 0.35;
/** Points per second leftwards that close the drawer regardless of how far it is open. */
const FLING_VELOCITY = -450;

/** Narrow-layout wrapper: slides the sidebar in from the left over the current screen. */
export default function SidebarDrawer(props: BottomTabBarProps) {
  const { drawerOpen, closeDrawer } = useSidebar();

  /** 0 shut, 1 fully open. Every visible part of the drawer is a reading of this. */
  const progress = useSharedValue(0);
  /** Where `progress` was when the current drag took hold. */
  const grabbed = useSharedValue(0);

  /**
   * On screen or on its way off it.
   *
   * Outlives `drawerOpen` by the length of the closing animation: the panel has
   * to stay interactive and, off iOS, mounted while it slides out.
   */
  const [live, setLive] = useState(false);
  /**
   * Whether the host is actually presented and can be animated in.
   *
   * Always true on iOS, where the overlay is never taken down. Off iOS it tracks
   * the Modal, which reports itself through `onShow` — and reports once per
   * presentation, so reopening during a close has to drive the animation itself
   * rather than wait for a callback that will not come again.
   */
  const presented = useRef(IOS);

  const open = useCallback(() => {
    progress.value = withTiming(1, { duration: OPEN_MS, easing: OPEN_EASING });
  }, [progress]);

  const settled = useCallback(() => {
    if (!IOS) presented.current = false;
    setLive(false);
  }, []);

  const close = useCallback(() => {
    progress.value = withTiming(0, { duration: CLOSE_MS, easing: CLOSE_EASING }, (finished) => {
      'worklet';
      // Interrupted means a reopen took it over, and the drawer must stay up for
      // that. Only a close that ran to the end has earned the teardown.
      if (finished) scheduleOnRN(settled);
    });
  }, [progress, settled]);

  useEffect(() => {
    if (drawerOpen) {
      setLive(true);
      if (presented.current) open();
      // Otherwise `onShow` starts it, once the Modal is genuinely up.
      return;
    }
    close();
  }, [drawerOpen, open, close]);

  const shown = useCallback(() => {
    presented.current = true;
    open();
  }, [open]);

  /**
   * Drag the backdrop to close, and let go early to have it finish the job.
   *
   * The backdrop rather than the panel, deliberately. A horizontal drag across
   * the panel is already spoken for: the nav reads sideways travel as the depth
   * a row is being dragged to (see `INDENT` in Sidebar), so a close gesture
   * there would be arguing with the tree over the same finger.
   */
  const drag = Gesture.Pan()
    .onStart(() => {
      grabbed.value = progress.value;
    })
    .onUpdate((e) => {
      const next = grabbed.value + e.translationX / SIDEBAR_WIDTH;
      progress.value = Math.min(1, Math.max(0, next));
    })
    .onEnd((e) => {
      // A flick closes it from anywhere; otherwise it goes wherever it is nearer.
      const closing = e.velocityX < FLING_VELOCITY || (e.velocityX <= 0 && progress.value < 0.5);
      if (!closing) {
        progress.value = withTiming(1, { duration: OPEN_MS, easing: OPEN_EASING });
        return;
      }
      progress.value = withTiming(0, { duration: CLOSE_MS, easing: CLOSE_EASING }, (finished) => {
        'worklet';
        // Tell React the drawer is shut. The effect above will run `close` on a
        // panel already at 0, which settles it immediately.
        if (finished) scheduleOnRN(closeDrawer);
      });
    });

  const tap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(closeDrawer);
  });

  const panel = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * SIDEBAR_WIDTH }],
  }));

  const backdrop = useAnimatedStyle(() => ({
    opacity: progress.value * BACKDROP_OPACITY,
  }));

  const content = (
    // Gestures do not reach across into another window on their own, so the
    // overlay needs a root of its own. `none` while shut is what keeps this
    // full-screen view from becoming the interactive subview that would make
    // the overlay claim every touch in the app.
    <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents={live ? 'auto' : 'none'}>
      <GestureDetector gesture={Gesture.Exclusive(drag, tap)}>
        <Animated.View style={[styles.backdrop, backdrop]} />
      </GestureDetector>
      <Animated.View style={[styles.panel, panel]}>
        <Sidebar {...props} onNavigate={closeDrawer} />
      </Animated.View>
    </GestureHandlerRootView>
  );

  if (IOS) return <FullWindowOverlay>{content}</FullWindowOverlay>;
  if (!live) return null;

  return (
    <Modal visible transparent animationType="none" onShow={shown} onRequestClose={closeDrawer}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#14140f',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
  },
});

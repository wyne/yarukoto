import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { FullWindowOverlay } from 'react-native-screens';
import {
  DRAWER_CLOSE_EASING,
  DRAWER_CLOSE_MS,
  DRAWER_OPEN_EASING,
  DRAWER_OPEN_MS,
  useDrawerState,
  useSidebar,
} from '../navigation/SidebarContext';
import Sidebar, { SIDEBAR_WIDTH, SidebarNavigationProps } from './Sidebar';

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

const BACKDROP_OPACITY = 0.35;
/**
 * Frames between the destination's render and the panel starting to leave.
 *
 * The render itself is over by the first of them — a frame callback cannot run
 * until the JS thread is free again — so these are for the mount that follows
 * it, which lands on the main thread and is the only thing that can stutter the
 * close. Raise it if the panel hitches; lower it if the drawer feels held open.
 */
const CLOSE_AFTER_FRAMES = 2;
/** Points per second leftwards that close the drawer regardless of how far it is open. */
const FLING_VELOCITY = -450;

/** Narrow-layout wrapper: slides the sidebar in from the left over the current screen. */
export default function SidebarDrawer(props: SidebarNavigationProps) {
  // 0 shut, 1 fully open. Every visible part of the drawer is a reading of it,
  // and it is shared so the edge swipe out in the layout can drive it too.
  const { drawerOpen, closeDrawer } = useDrawerState();
  const { drawerProgress: progress } = useSidebar();

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

  /**
   * Both of these time the distance still to travel, not the whole span.
   *
   * A swipe let go at nine tenths open has one tenth left, and giving that the
   * full duration would crawl it — the panel would leap to the finger's pace and
   * then wade the last few points. Scaling keeps one speed however the movement
   * was started, so finishing a gesture and tapping the menu look like the same
   * drawer.
   */
  const open = useCallback(() => {
    const left = 1 - progress.value;
    progress.value = withTiming(1, {
      duration: DRAWER_OPEN_MS * left,
      easing: DRAWER_OPEN_EASING,
    });
  }, [progress]);

  const settled = useCallback(() => {
    if (!IOS) presented.current = false;
    setLive(false);
  }, []);

  const close = useCallback(() => {
    progress.value = withTiming(
      0,
      { duration: DRAWER_CLOSE_MS * progress.value, easing: DRAWER_CLOSE_EASING },
      (finished) => {
        'worklet';
        // Interrupted means a reopen took it over, and the drawer must stay up
        // for that. Only a close that ran to the end has earned the teardown.
        if (finished) scheduleOnRN(settled);
      }
    );
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
   * Shut the panel from wherever it is, and tell React once it has arrived.
   *
   * A worklet, so the movement starts on the touch that asked for it rather
   * than after a render — going through React first is a pause you can see, and
   * the drag not having one is the only reason it ever felt better than the tap.
   * Telling React last is safe because `closeDrawer` re-runs this same movement
   * on a panel already at rest, which costs nothing.
   */
  const shut = useCallback(() => {
    'worklet';
    progress.value = withTiming(
      0,
      { duration: DRAWER_CLOSE_MS * progress.value, easing: DRAWER_CLOSE_EASING },
      (finished) => {
        'worklet';
        if (finished) scheduleOnRN(closeDrawer);
      }
    );
  }, [progress, closeDrawer]);

  /**
   * Everything the destination costs happens while the panel is still open and
   * still. Only then does it leave.
   *
   * Three orderings were tried. Closing and then navigating put a screen refresh
   * front and centre, after the panel had gone: two steps, and the second one
   * announced itself. Closing and navigating together made the panel stutter —
   * the render cannot stall a Reanimated transform, but the native mount that
   * follows it lands on the main thread, which is the thread the close is drawn
   * on. What is left is to do the work first: the panel is stationary, so there
   * is no animation for the mount to interfere with, and by the time it moves
   * both threads are idle and what it uncovers is already the destination.
   *
   * This only reads as immediate because the tap is answered before any of it.
   * The nav marks the row selected on the frame it was pressed (see `pending` in
   * `Sidebar`), so the pause between the tap and the panel leaving is a pause
   * with the answer already visible in it, rather than one that looks like a
   * tap that missed.
   */
  const navigateThenClose = useCallback(
    (navigate: () => void) => {
      // One frame, so the row the user pressed has painted as selected before
      // the destination takes the JS thread for the length of its render.
      requestAnimationFrame(() => {
        navigate();
        // Counts down through `step` itself, so zero would mean the same tick.
        let frames = CLOSE_AFTER_FRAMES;
        const step = () => (frames-- > 0 ? requestAnimationFrame(step) : closeDrawer());
        step();
      });
    },
    [closeDrawer]
  );

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
        progress.value = withTiming(1, {
          duration: DRAWER_OPEN_MS * (1 - progress.value),
          easing: DRAWER_OPEN_EASING,
        });
        return;
      }
      shut();
    });

  const tap = Gesture.Tap().onEnd(() => {
    shut();
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
      {/*
        Rendered plainly, and kept cheap by the memo on `Sidebar` itself rather
        than by holding it still here.

        Holding it was tried, and it moved the cost rather than removing it: a
        nav that had changed while the panel was shut then had its whole tree to
        rebuild on the one frame the open animation starts, which is the frame
        least able to afford it. Letting each change land where it happens
        spreads the same work over moments that are already still.
      */}
      <Animated.View style={[styles.panel, panel]}>
        <Sidebar {...props} onNavigate={navigateThenClose} />
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

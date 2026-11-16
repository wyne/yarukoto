import React, { useMemo, useRef, useState } from 'react';
import { AccessibilityActionEvent, PanResponder, View } from 'react-native';
import ResizeCursorView from '../../../modules/mac-pointer/src/ResizeCursorView';
import { makeStyles } from '../../theme/styles';
import { useAccent } from '../../theme/ThemeContext';
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarCollapsed,
  useSidebarWidth,
} from '../../navigation/SidebarContext';

/** How wide the grab area is, laid over the sidebar's own right edge. */
const HANDLE_WIDTH = 6;
/**
 * Where a drag gives up on the full sidebar and snaps to the rail: halfway
 * between the two, so the edge goes to whichever it is nearer when let go.
 */
const SNAP_TO_RAIL_BELOW = (SIDEBAR_MIN_WIDTH + SIDEBAR_COLLAPSED_WIDTH) / 2;
/** Two presses this close together, without a drag between, are a double-click. */
const DOUBLE_CLICK_MS = 350;
/** Movement under this is still a click. */
const CLICK_SLOP = 3;
/** What one step of the keyboard or a screen reader moves the edge. */
const STEP = 20;

/**
 * The pinned sidebar's right edge, which can be dragged.
 *
 * Between the minimum and the maximum it follows the pointer; past the minimum
 * the sidebar snaps to its rail, and dragging the rail's edge back out brings
 * the full sidebar back. A double-click returns the default width. The width
 * is only saved when the drag ends, so a drag in progress writes nothing.
 */
export default function SidebarResizer() {
  const styles = useStyles();
  const accent = useAccent();
  const collapsed = useSidebarCollapsed();
  const { width, maxWidth, setWidth, resetWidth, setRail } = useSidebarWidth();
  const [dragging, setDragging] = useState(false);

  // The responder is built once, so everything it reads goes through a ref.
  const live = useRef({ width, maxWidth, collapsed, setWidth, resetWidth, setRail });
  live.current = { width, maxWidth, collapsed, setWidth, resetWidth, setRail };
  const drag = useRef({ start: 0, rail: false, moved: false, lastPress: 0 });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          const now = live.current;
          drag.current.start = now.collapsed ? SIDEBAR_COLLAPSED_WIDTH : now.width;
          drag.current.rail = now.collapsed;
          drag.current.moved = false;
          setDragging(true);
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dx) > CLICK_SLOP) drag.current.moved = true;
          const now = live.current;
          const proposed = drag.current.start + gesture.dx;
          const rail = proposed < SNAP_TO_RAIL_BELOW;
          if (rail !== drag.current.rail) {
            drag.current.rail = rail;
            now.setRail(rail);
          }
          if (!rail) now.setWidth(Math.min(proposed, now.maxWidth));
        },
        onPanResponderRelease: () => {
          setDragging(false);
          const now = live.current;
          if (!drag.current.moved) {
            const at = Date.now();
            if (at - drag.current.lastPress < DOUBLE_CLICK_MS) {
              drag.current.lastPress = 0;
              now.resetWidth();
            } else {
              drag.current.lastPress = at;
            }
            return;
          }
          drag.current.lastPress = 0;
          if (!drag.current.rail) now.setWidth(now.width, true);
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          const now = live.current;
          if (!drag.current.rail) now.setWidth(now.width, true);
        },
      }),
    []
  );

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const delta = event.nativeEvent.actionName === 'increment' ? STEP : -STEP;
    if (collapsed) {
      if (delta > 0) setRail(false);
      return;
    }
    if (delta < 0 && width <= SIDEBAR_MIN_WIDTH) setRail(true);
    else setWidth(Math.min(width + delta, maxWidth), true);
  };

  return (
    <ResizeCursorView
      style={styles.handle}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Resize sidebar"
      accessibilityValue={{ text: collapsed ? 'Collapsed' : `${Math.round(width)} points` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      {...pan.panHandlers}
    >
      {dragging && <View style={[styles.line, { backgroundColor: accent }]} />}
    </ResizeCursorView>
  );
}

const useStyles = makeStyles(() => ({
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: HANDLE_WIDTH,
    alignItems: 'flex-end',
    ...({ cursor: 'col-resize', userSelect: 'none' } as object),
  },
  /** Drawn over the sidebar's border while it is being dragged, so the edge in hand is plain. */
  line: {
    width: 2,
    height: '100%',
  },
}));

import React from 'react';
import { Animated, Text, View } from 'react-native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { formatDueFull } from '../data/dateUtils';
import { isoFromDayTarget } from './hitTest';
import { useDrag, useDragOverId, useDragPayload } from './DragContext';

/** As wide as the pill may grow, and the box it is measured in. */
const GHOST_WIDTH = 240;
/** Clearance between the bottom of the pill and the pointer itself. */
const GHOST_LIFT = 32;
/** One line of the pill, which is all `numberOfLines={1}` ever gives it. */
const GHOST_HEIGHT = 44;

/**
 * The ghost that follows the pointer during a drag. Mounted once, app-level.
 *
 * Anchored at the pointer, then shifted up and centred on it — a thumb covering
 * the point below stays out of the way, and a long title can't drift off to the
 * side where it's easy to lose against a busy calendar.
 *
 * While the drag is over a day destination the target date leads the title, so
 * the finger knows where the drop would land before it lifts.
 */
export default function DragOverlay() {
  const styles = useStyles();
  const { pointer } = useDrag();
  const payload = useDragPayload();
  const overId = useDragOverId();
  if (!payload) return null;

  const targetIso = overId ? isoFromDayTarget(overId) : null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.positioner, { transform: pointer.getTranslateTransform() }]}
    >
      <View style={styles.ghost}>
        <Text style={styles.text} numberOfLines={1}>
          {targetIso && <Text style={styles.date}>{formatDueFull(targetIso)}: </Text>}
          {payload.title}
        </Text>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  /**
   * A box of known size, hung above and to the left of the pointer so that the
   * pill inside it comes out centred on the finger with GHOST_LIFT of clearance.
   *
   * The size is what matters. This used to be a zero-sized point with the pill
   * absolutely positioned off it at `left: '50%'`, which reads well and lays out
   * badly: an absolutely positioned view with no width of its own passes that
   * width down as a constraint, so the pill measured against zero and collapsed
   * to its own padding. Nothing to see, at any pointer position, on any screen.
   */
  positioner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: GHOST_WIDTH,
    marginLeft: -GHOST_WIDTH / 2,
    height: GHOST_HEIGHT,
    marginTop: -(GHOST_HEIGHT + GHOST_LIFT),
    // Centred across the box, and sitting on its floor, which is the line
    // GHOST_LIFT above the pointer.
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  ghost: {
    // In flow, so it takes the width of its own text up to the box's, rather
    // than being placed against a width it has to be told about.
    maxWidth: GHOST_WIDTH,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    // Liquid glass: a translucent pane with a hairline edge and a soft shadow,
    // so the calendar keeps showing through behind the finger.
    backgroundColor: c.glassFill,
    borderWidth: 1,
    borderColor: c.glassBorder,
    shadowColor: c.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: c.textPrimary,
  },
  date: {
    // The destination, dimmer than the title so the task itself stays the focus.
    color: c.textSecondary,
  },
}));

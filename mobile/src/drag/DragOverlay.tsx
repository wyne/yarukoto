import React from 'react';
import { Animated, Text, View } from 'react-native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { formatDueFull } from '../data/dateUtils';
import { isoFromDayTarget } from './hitTest';
import { useDrag } from './DragContext';

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
  const { payload, pointer, overId } = useDrag();
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
  // Zero-sized: its top-left sits on the pointer and the ghost is positioned
  // relative to that single point.
  positioner: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  ghost: {
    position: 'absolute',
    // Half of a zero-width parent is zero, so the pill's left edge starts at the
    // pointer; translating back by its own width centres it on the point.
    left: '50%',
    bottom: 32,
    transform: [{ translateX: '-50%' }],
    maxWidth: 240,
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
    zIndex: 1000,
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

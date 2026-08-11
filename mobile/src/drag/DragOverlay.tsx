import React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useDrag } from './DragContext';

/** The ghost that follows the pointer during a drag. Mounted once, app-level. */
export default function DragOverlay() {
  const { payload, pointer } = useDrag();
  if (!payload) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ghost, { transform: pointer.getTranslateTransform() }]}
    >
      <Text style={styles.text} numberOfLines={1}>
        {payload.title}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Sits just below-right of the pointer so it never hides the drop target.
    marginTop: 10,
    marginLeft: 12,
    maxWidth: 240,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.textPrimary,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 1000,
  },
  text: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: '#fff',
  },
});

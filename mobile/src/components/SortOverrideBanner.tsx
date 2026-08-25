import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { SortBy, sortLabel } from '../data/viewOptions';

interface Props {
  /** The sort this view's manual arrangement is currently overriding. */
  sortBy: SortBy;
  onRestore: () => void;
}

/**
 * Shown while a view is ordered by hand despite having a sort selected. It is the
 * whole warning — persistent and not dismissable — so a customised order can never
 * quietly look like a broken sort, and the way back is always one tap away.
 */
export default function SortOverrideBanner({ sortBy, onRestore }: Props) {
  const styles = useStyles();
  const accent = useAccent();

  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>
        Custom order · {sortLabel(sortBy)} sort paused
      </Text>
      <Pressable onPress={onRestore} hitSlop={8}>
        <Text style={[styles.action, { color: accent }]}>Restore</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  label: {
    flexShrink: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  action: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
}));

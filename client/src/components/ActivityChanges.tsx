import React from 'react';
import { Text, View } from 'react-native';
import { Palette } from '../theme/colors';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useColors } from '../theme/ThemeContext';
import { ActivityKind } from '../data/activityFilter';
import { ActivityChange } from '../data/activityItems';
import { IconChevronRight } from '../icons/Icons';

/** A function rather than a table, because the colours it names now move. */
export function eventColor(kind: ActivityKind, c: Palette): string {
  switch (kind) {
    case 'create':
      return c.success;
    case 'edit':
      return c.priorityLow;
    case 'complete':
      return c.purple;
    case 'delete':
      return c.priorityHigh;
    case 'restore':
      return c.teal;
    case 'reopen':
      return c.orange;
  }
}

interface Props {
  changes: ActivityChange[];
  /** Show this many and count the rest, for a feed row that must stay short. */
  limit?: number;
}

/** The fields an edit touched, each as its old value struck through beside the new one. */
export default function ActivityChanges({ changes, limit }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const shown = limit === undefined ? changes : changes.slice(0, limit);
  return (
    <View style={styles.changes}>
      {shown.map((change) => (
        <View key={change.label} style={styles.changeRow}>
          <Text style={styles.changeLabel} numberOfLines={1}>
            {change.label}
          </Text>
          <Text style={styles.changeBefore} numberOfLines={1} ellipsizeMode="tail">
            {change.before}
          </Text>
          <IconChevronRight size={11} color={colors.textFaint} />
          <Text style={styles.changeAfter} numberOfLines={1} ellipsizeMode="tail">
            {change.after}
          </Text>
        </View>
      ))}
      {changes.length > shown.length && <Text style={styles.changeMore}>+{changes.length - shown.length} more</Text>}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  changes: {
    marginTop: 6,
    gap: 3,
  },
  changeRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  changeLabel: {
    width: 58,
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: c.textTertiary,
  },
  changeBefore: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.textTertiary,
    textDecorationLine: 'line-through',
  },
  changeAfter: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: c.textSecondary,
  },
  changeMore: {
    marginLeft: 63,
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: c.textTertiary,
  },
}));

import React from 'react';
import { Text, View } from 'react-native';
import { Palette } from '../theme/colors';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useColors } from '../theme/ThemeContext';
import { ActivityKind } from '../data/activityFilter';
import { ActivityChange, ChangeLine } from '../data/activityItems';
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

/** Changed lines a feed row shows of one field, however many the full history would. */
const FEED_LINES = 3;

const LINE_SIGN: Record<ChangeLine['kind'], string> = {
  added: '+ ',
  removed: '− ',
  checked: '✓ ',
  unchecked: '○ ',
  renamed: '',
};

/** The fields an edit touched, each as its old value struck through beside the new one. */
export default function ActivityChanges({ changes, limit }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const shown = limit === undefined ? changes : changes.slice(0, limit);
  const lineLimit = limit === undefined ? undefined : FEED_LINES;
  const hiddenLines = (change: ActivityChange) =>
    (change.diff?.hidden ?? 0) + Math.max(0, (change.diff?.lines.length ?? 0) - (lineLimit ?? Infinity));
  return (
    <View style={styles.changes}>
      {shown.map((change) =>
        change.diff?.lines.length ? (
          <View key={change.label} style={styles.diffRow}>
            <Text style={styles.changeLabel} numberOfLines={1}>
              {change.label}
            </Text>
            <View style={styles.diffLines}>
              {change.diff.lines.slice(0, lineLimit).map((line, n) =>
                line.kind === 'renamed' ? (
                  <View key={n} style={styles.changeRow}>
                    <Text style={[styles.changeBefore, styles.renamed]} numberOfLines={1} ellipsizeMode="tail">
                      {line.before}
                    </Text>
                    <IconChevronRight size={11} color={colors.textFaint} />
                    <Text style={[styles.changeAfter, styles.renamed]} numberOfLines={1} ellipsizeMode="tail">
                      {line.text}
                    </Text>
                  </View>
                ) : (
                  <Text key={n} style={styles[line.kind]} numberOfLines={1} ellipsizeMode="tail">
                    <Text style={styles.diffSign}>{LINE_SIGN[line.kind]}</Text>
                    {line.text}
                  </Text>
                )
              )}
              {hiddenLines(change) > 0 && (
                <Text style={styles.diffMore}>
                  +{hiddenLines(change)} more {hiddenLines(change) === 1 ? (change.diff.unit ?? 'line') : `${change.diff.unit ?? 'line'}s`}
                </Text>
              )}
            </View>
          </View>
        ) : (
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
        )
      )}
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
  diffRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  diffLines: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  // Each title takes only its own width, so a short rename is not cut off.
  renamed: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
  },
  diffSign: {
    fontFamily: fonts.monoRegular,
  },
  removed: {
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.priorityHigh,
  },
  added: {
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.success,
  },
  checked: {
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.purple,
  },
  unchecked: {
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.orange,
  },
  diffMore: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: c.textTertiary,
  },
  changeMore: {
    marginLeft: 63,
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: c.textTertiary,
  },
}));

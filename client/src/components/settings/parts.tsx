import React from 'react';
import { ActivityIndicator, StyleProp, Text, View, ViewStyle } from 'react-native';
import Pressable from '../HoverPressable';
import { IconChevronRight } from '../../icons/Icons';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { useHoverBg } from '../../theme/hover';

/**
 * The building blocks every Settings page is drawn from: a labelled group of
 * rows, with an optional note under it. The grouped-list shape of the system's
 * own Settings, so each page reads as a few short boxes rather than one scroll.
 */

export function Group({
  label,
  note,
  children,
  style,
}: {
  label?: string;
  /** Explains the rows above it, directly under them rather than somewhere else on the page. */
  note?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View style={style}>
      {label ? <Text style={styles.groupLabel}>{label}</Text> : null}
      <View style={styles.group}>{children}</View>
      {note ? <Text style={styles.groupNote}>{note}</Text> : null}
    </View>
  );
}

interface RowProps {
  title?: string;
  subtitle?: string | null;
  /** Shown at the trailing edge, quieter than the title. */
  value?: string | null;
  mono?: boolean;
  /** A control in place of the value: a segment, swatches, a button. */
  trailing?: React.ReactNode;
  /** Something before the title, such as a status dot. */
  leading?: React.ReactNode;
  onPress?: () => void;
  /** Draws a chevron: this row opens a page. */
  chevron?: boolean;
  /** `action` is a row that does something; `danger` one that ends something. */
  tone?: 'default' | 'action' | 'danger';
  selected?: boolean;
  busy?: boolean;
  /** Draws the divider above it — every row but a group's first. */
  divided?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  children?: React.ReactNode;
}

export function Row({
  title,
  subtitle,
  value,
  mono,
  trailing,
  leading,
  onPress,
  chevron,
  tone = 'default',
  selected,
  busy,
  divided,
  accessibilityLabel,
  accessibilityRole,
  children,
}: RowProps) {
  const styles = useStyles();
  const colors = useColors();
  const accent = useAccent();
  const hoverBg = useHoverBg();
  const titleColor = tone === 'danger' ? colors.priorityHigh : tone === 'action' ? accent : colors.textPrimary;

  const body = (
    <>
      {leading}
      {children ?? (
        <View style={styles.rowText}>
          <Text
            style={[
              styles.rowTitle,
              { color: titleColor },
              tone !== 'default' && styles.rowTitleAction,
              tone === 'danger' && styles.rowTitleCentered,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
      {value ? (
        <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1} selectable={!onPress}>
          {value}
        </Text>
      ) : null}
      {busy ? <ActivityIndicator color={titleColor} /> : trailing}
      {chevron ? <IconChevronRight size={14} color={colors.textFaint} /> : null}
    </>
  );

  const style = [styles.row, divided && styles.rowDivided, selected && { backgroundColor: colors.selectedRowBg }];
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={hoverBg(style, selected)}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={selected === undefined ? undefined : { selected }}
    >
      {body}
    </Pressable>
  );
}

/** A small segmented control: appearance, who a new device is for. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.segment, style]} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segmentOption, selected && styles.segmentSelected]}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Plain text under or between groups. */
export function Note({ children, tone }: { children: React.ReactNode; tone?: 'ok' | 'error' }) {
  const styles = useStyles();
  const colors = useColors();
  const color = tone === 'ok' ? colors.success : tone === 'error' ? colors.priorityHigh : undefined;
  return <Text style={[styles.note, color ? { color } : null]}>{children}</Text>;
}

/** The space between groups on a page. */
export const PAGE_GAP = 18;

const useStyles = makeStyles((c) => ({
  groupLabel: {
    marginBottom: 6,
    paddingHorizontal: 4,
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  group: {
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  groupNote: {
    marginTop: 6,
    paddingHorizontal: 4,
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    lineHeight: 17,
    color: c.textTertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
  rowTitleAction: {
    fontFamily: fonts.sansMedium,
  },
  rowTitleCentered: {
    textAlign: 'center',
  },
  rowSubtitle: {
    marginTop: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.textTertiary,
  },
  rowValue: {
    flexShrink: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textTertiary,
  },
  mono: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
  },
  segmentOption: {
    flex: 1,
    height: 30,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 6,
  },
  segmentSelected: {
    backgroundColor: c.surface,
    borderColor: c.dividerStrong,
    shadowColor: c.shadow,
    shadowOpacity: c.shadowOpacity,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.textSecondary,
  },
  segmentTextSelected: {
    fontFamily: fonts.sansMedium,
    color: c.textPrimary,
  },
  note: {
    paddingHorizontal: 4,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    color: c.textTertiary,
  },
}));

/**
 * The + and − under a desktop list, as macOS draws them under any list you
 * can add to and take from. − acts on the selected row.
 */
export function ListButtons({
  onAdd,
  addLabel,
  onRemove,
  removeLabel,
}: {
  onAdd?: () => void;
  addLabel: string;
  /** Absent while nothing removable is selected. */
  onRemove?: () => void;
  removeLabel: string;
}) {
  const styles = useListButtonStyles();
  const colors = useColors();
  const hoverBg = useHoverBg();
  return (
    <View style={styles.bar}>
      {[
        { glyph: '+', run: onAdd, label: addLabel },
        { glyph: '−', run: onRemove, label: removeLabel },
      ].map((b) => (
        <Pressable
          key={b.glyph}
          onPress={b.run}
          disabled={!b.run}
          style={hoverBg(styles.button, !b.run)}
          accessibilityRole="button"
          accessibilityLabel={b.label}
          accessibilityState={{ disabled: !b.run }}
        >
          <Text style={[styles.glyph, { color: b.run ? colors.textSecondary : colors.textFaint }]}>{b.glyph}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const useListButtonStyles = makeStyles((c) => ({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
  button: {
    width: 32,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: c.border,
  },
  glyph: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    lineHeight: 18,
  },
}));

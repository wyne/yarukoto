import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import BottomSheet from './BottomSheet';
import {
  GROUP_BY_OPTIONS,
  GroupBy,
  SORT_BY_OPTIONS,
  SortBy,
  ViewOptions,
  sortLabel,
} from '../data/viewOptions';

interface Props {
  visible: boolean;
  onClose: () => void;
  value: ViewOptions;
  onChange: (next: ViewOptions) => void;
}

export default function ViewOptionsSheet({ visible, onClose, value, onChange }: Props) {
  const accent = useAccent();

  const renderRow = <T extends string>(
    label: string,
    options: { value: T; label: string }[],
    selected: T,
    onSelect: (v: T) => void
  ) => (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title="View options">
      {renderRow<GroupBy>('Group by', GROUP_BY_OPTIONS, value.groupBy, (groupBy) =>
        onChange({ ...value, groupBy })
      )}
      {renderRow<SortBy>('Sort by', SORT_BY_OPTIONS, value.sortBy, (sortBy) =>
        onChange({ ...value, sortBy })
      )}
      {/* Picking a *different* sort clears the override on its own; this is the way
          back for someone who wants the sort they already have. */}
      {value.sortOverridden && (
        <Pressable style={styles.restore} onPress={() => onChange({ ...value, sortOverridden: false })}>
          <Text style={styles.restoreText}>
            Order customised — restore {sortLabel(value.sortBy)} sort
          </Text>
        </Pressable>
      )}
      <Pressable style={styles.doneBtn} onPress={onClose}>
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
    minHeight: 34,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: '#fff',
  },
  restore: {
    marginTop: -8,
    marginBottom: 18,
  },
  restoreText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textTertiary,
  },
  doneBtn: {
    marginTop: 2,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
  },
  doneBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
});

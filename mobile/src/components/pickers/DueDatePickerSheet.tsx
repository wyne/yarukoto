import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { addDays, toISODate } from '../../data/dateUtils';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to BottomSheet: a point makes this a popover on wide web. */
  anchor?: PopoverAnchor | null;
  initialDate?: string;
  initialTime?: string;
  onApply: (dueDate: string | undefined, dueTime: string | undefined) => void;
}

/** Shared with the composer's date popover so there's one set of presets. */
export const DATE_OPTIONS: { label: string; get: (now: Date) => string | undefined }[] = [
  { label: 'Today', get: (now) => toISODate(now) },
  { label: 'Tomorrow', get: (now) => toISODate(addDays(now, 1)) },
  { label: 'This weekend', get: (now) => toISODate(addDays(now, (6 - now.getDay() + 7) % 7 || 6)) },
  { label: 'Next week', get: (now) => toISODate(addDays(now, 7)) },
  { label: 'No date', get: () => undefined },
];

export const TIME_OPTIONS: { label: string; value: string | undefined }[] = [
  { label: '9:00 AM', value: '09:00' },
  { label: '2:00 PM', value: '14:00' },
  { label: '6:00 PM', value: '18:00' },
  { label: 'No time', value: undefined },
];

export default function DueDatePickerSheet({ visible, onClose, initialDate, initialTime, onApply, anchor }: Props) {
  const accent = useAccent();
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    if (visible) {
      setDate(initialDate);
      setTime(initialTime);
    }
  }, [visible, initialDate, initialTime]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Due date"
      anchor={anchor}
      popoverWidth={330}
    >
      <Text style={styles.label}>Date</Text>
      <View style={styles.chipsRow}>
        {DATE_OPTIONS.map((opt) => {
          const val = opt.get(new Date());
          const active = val === date;
          return (
            <Pressable
              key={opt.label}
              style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => setDate(val)}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.label, { marginTop: 14 }]}>Time</Text>
      <View style={styles.chipsRow}>
        {TIME_OPTIONS.map((opt) => {
          const active = opt.value === time;
          return (
            <Pressable
              key={opt.label}
              style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => setTime(opt.value)}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        style={[styles.applyBtn, { backgroundColor: colors.textPrimary }]}
        onPress={() => {
          onApply(date, date ? time : undefined);
          onClose();
        }}
      >
        <Text style={styles.applyText}>Apply</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  applyBtn: {
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
});

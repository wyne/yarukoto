import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { addDays, formatTime24to12, fromISODate, toISODate } from '../../data/dateUtils';

/** Shared with the composer's date popover so there's one set of presets. */
export const DATE_OPTIONS: { label: string; get: (now: Date) => string | undefined }[] = [
  { label: 'Today', get: (now) => toISODate(now) },
  { label: 'Tomorrow', get: (now) => toISODate(addDays(now, 1)) },
  { label: 'This weekend', get: (now) => toISODate(addDays(now, (6 - now.getDay() + 7) % 7 || 6)) },
  { label: 'Next week', get: (now) => toISODate(addDays(now, 7)) },
];

interface Props {
  date?: string;
  time?: string;
  onChange: (date: string | undefined, time: string | undefined) => void;
}

function parseTime(time?: string): { hours: number; minutes: number } {
  if (!time) return { hours: 9, minutes: 0 };
  const [hours, minutes] = time.split(':').map(Number);
  return { hours: Number.isFinite(hours) ? hours : 9, minutes: Number.isFinite(minutes) ? minutes : 0 };
}

function valueForPicker(date?: string, time?: string): Date {
  const value = date ? fromISODate(date) : new Date();
  const { hours, minutes } = parseTime(time);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function timeFromDate(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(fromISODate(value).getTime());
}

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export default function DueDateTimeControls({ date, time, onChange }: Props) {
  const accent = useAccent();
  const now = new Date();
  const pickerValue = valueForPicker(date, time);
  const nativePicker = Platform.OS !== 'web';

  const setDate = (next: string | undefined) => onChange(next, next ? time : undefined);
  const setTime = (next: string | undefined) => onChange(next ? (date ?? toISODate(now)) : date, next);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Date</Text>
      <View style={styles.chipsRow}>
        {DATE_OPTIONS.map((opt) => {
          const value = opt.get(now);
          const active = value === date;
          return (
            <Pressable
              key={opt.label}
              style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => setDate(value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.chip, !date && { backgroundColor: accent, borderColor: accent }]}
          onPress={() => setDate(undefined)}
        >
          <Text style={[styles.chipText, !date && styles.chipTextActive]}>No date</Text>
        </Pressable>
      </View>

      {nativePicker ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          presentation="inline"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onValueChange={(_, selected) => setDate(toISODate(selected))}
          style={styles.nativeDatePicker}
        />
      ) : (
        <TextInput
          value={date ?? ''}
          onChangeText={(value) => {
            const trimmed = value.trim();
            if (!trimmed) setDate(undefined);
            else if (isISODate(trimmed)) setDate(trimmed);
          }}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textFaint}
          style={styles.textInput}
        />
      )}

      <Text style={[styles.label, styles.timeLabel]}>Time</Text>
      {nativePicker ? (
        <DateTimePicker
          value={pickerValue}
          mode="time"
          presentation="inline"
          display={Platform.OS === 'ios' ? 'compact' : 'default'}
          onValueChange={(_, selected) => setTime(timeFromDate(selected))}
          style={styles.nativeTimePicker}
        />
      ) : (
        <TextInput
          value={time ?? ''}
          onChangeText={(value) => {
            const trimmed = value.trim();
            if (!trimmed) setTime(undefined);
            else if (isTime(trimmed)) setTime(trimmed);
          }}
          placeholder="HH:MM"
          placeholderTextColor={colors.textFaint}
          style={styles.textInput}
        />
      )}
      <View style={styles.timeActions}>
        {!!time && (
          <Text style={styles.selectedTime}>{formatTime24to12(time)}</Text>
        )}
        <Pressable style={styles.clearTime} onPress={() => setTime(undefined)}>
          <Text style={styles.clearTimeText}>No time</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: 8,
  },
  timeLabel: {
    marginTop: 14,
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
  chipTextActive: {
    color: '#fff',
  },
  nativeDatePicker: {
    width: '100%',
    minHeight: Platform.OS === 'ios' ? 320 : 260,
    marginTop: 8,
  },
  nativeTimePicker: {
    width: '100%',
    minHeight: Platform.OS === 'ios' ? 44 : 180,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  timeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  selectedTime: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  clearTime: {
    paddingVertical: 6,
  },
  clearTimeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textTertiary,
  },
});

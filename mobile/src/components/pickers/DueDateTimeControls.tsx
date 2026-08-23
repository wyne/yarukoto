import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { formatTime24to12, fromISODate, toISODate } from '../../data/dateUtils';

interface Props {
  date?: string;
  time?: string;
  onChange: (date: string | undefined, time: string | undefined) => void;
  initialMode?: PickerMode;
  /** Allows switching between date and time inside the control. */
  allowModeSwitch?: boolean;
  /** Called after a native picker value is selected in inline menus. Sheets omit this so Apply remains explicit. */
  onDone?: () => void;
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

type PickerMode = 'date' | 'time';

export default function DueDateTimeControls({
  date,
  time,
  onChange,
  initialMode = 'date',
  allowModeSwitch = true,
  onDone,
}: Props) {
  const accent = useAccent();
  const now = new Date();
  const pickerValue = valueForPicker(date, time);
  const nativePicker = Platform.OS !== 'web';
  const [pickerMode, setPickerMode] = useState<PickerMode>(initialMode);

  useEffect(() => {
    setPickerMode(initialMode);
  }, [initialMode]);

  const finish = () => {
    onDone?.();
  };
  const dismissDialog = () => {
    if (onDone) {
      onDone();
      return;
    }
    setPickerMode(initialMode);
  };
  const setDate = (next: string | undefined, done = false) => {
    onChange(next, next ? time : undefined);
    if (done) finish();
  };
  const setTime = (next: string | undefined, done = false) => {
    onChange(next ? (date ?? toISODate(now)) : date, next);
    if (done) finish();
  };
  const dateLabel = date
    ? fromISODate(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Pick a date';
  const timeLabel = time ? formatTime24to12(time) : 'None';

  if (pickerMode === 'date') {
    return (
      <View style={styles.wrap}>
        <View style={styles.headerRow}>
          <Text style={styles.label}>Custom date</Text>
          {allowModeSwitch && !!date && (
            <Pressable style={styles.modeButton} onPress={() => setPickerMode('time')}>
              <Text style={[styles.modeButtonText, { color: accent }]}>Time</Text>
            </Pressable>
          )}
        </View>
        {nativePicker && Platform.OS === 'ios' ? (
          <View style={styles.nativeRow}>
            <Text style={styles.nativeRowLabel}>{dateLabel}</Text>
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display="compact"
              accentColor={accent}
              onValueChange={(_, selected) => setDate(toISODate(selected), true)}
              style={styles.compactNativePicker}
            />
          </View>
        ) : nativePicker ? (
          <DateTimePicker
            value={pickerValue}
            mode="date"
            presentation="dialog"
            display="default"
            accentColor={accent}
            positiveButton={{ label: 'Set' }}
            negativeButton={{ label: 'Cancel' }}
            onDismiss={dismissDialog}
            onValueChange={(_, selected) => setDate(toISODate(selected), true)}
            style={styles.dialogHost}
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
        {(date || time) && (
          <Pressable style={styles.clearRow} onPress={() => setDate(undefined, true)}>
            <Text style={styles.clearText}>Clear due date</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (pickerMode === 'time') {
    return (
      <View style={styles.wrap}>
        <View style={styles.headerRow}>
          <Text style={styles.label}>Time</Text>
          {allowModeSwitch && (
            <Pressable style={styles.modeButton} onPress={() => setPickerMode('date')}>
              <Text style={[styles.modeButtonText, { color: accent }]}>Date</Text>
            </Pressable>
          )}
        </View>
        {nativePicker && Platform.OS === 'ios' ? (
          <View style={styles.nativeRow}>
            <Text style={styles.nativeRowLabel}>{timeLabel}</Text>
            <DateTimePicker
              value={pickerValue}
              mode="time"
              display="compact"
              accentColor={accent}
              onValueChange={(_, selected) => setTime(timeFromDate(selected), true)}
              style={styles.compactNativePicker}
            />
          </View>
        ) : nativePicker ? (
          <DateTimePicker
            value={pickerValue}
            mode="time"
            presentation="dialog"
            display="default"
            accentColor={accent}
            positiveButton={{ label: 'Set' }}
            negativeButton={{ label: 'Cancel' }}
            onDismiss={dismissDialog}
            onValueChange={(_, selected) => setTime(timeFromDate(selected), true)}
            style={styles.dialogHost}
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
        {!!time && (
          <Pressable style={styles.clearRow} onPress={() => setTime(undefined, true)}>
            <Text style={styles.clearText}>Clear time</Text>
          </Pressable>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  headerRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: 8,
  },
  modeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modeButtonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  nativeRow: {
    minHeight: 44,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nativeRowLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  compactNativePicker: {
    minWidth: 116,
    minHeight: 32,
  },
  dialogHost: {
    width: '100%',
    height: 1,
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
  clearRow: {
    marginTop: 8,
    paddingVertical: 8,
  },
  clearText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.priorityHigh,
  },
});

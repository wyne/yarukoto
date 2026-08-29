import React, { useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import MenuView, { type MenuAction, type NativeActionEvent } from '@expo/ui/community/menu';
import { selectionCheckColor } from '../../theme/colors';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { formatTime24to12, toISODate } from '../../data/dateUtils';
import {
  DEFAULT_REMINDER_TIME,
  REMINDER_DAY_PRESETS,
  REMINDER_TIME_PRESETS,
  createReminder,
  formatReminder,
  hasReminder,
  normalizeReminders,
  reminderKey,
  reminderPresets,
} from '../../data/reminders';
import type { TaskReminder } from '../../data/types';
import { useNativeDateTimePicker } from '../../navigation/DateTimePickerContext';
import NativeSheet from '../NativeSheet';
import NativeOwnedTextInput from '../NativeOwnedTextInput';

const TOGGLE_ID_PREFIX = 'toggle|';

interface Props {
  reminders?: TaskReminder[];
  dueTime?: string;
  onChange: (reminders: TaskReminder[]) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function presetToggleId(preset: Pick<TaskReminder, 'offsetDays' | 'time'>): string {
  return `${TOGGLE_ID_PREFIX}${preset.offsetDays}|${preset.time}`;
}

function parsePresetToggleId(id: string): Pick<TaskReminder, 'offsetDays' | 'time'> | null {
  if (!id.startsWith(TOGGLE_ID_PREFIX)) return null;
  const [days, time] = id.slice(TOGGLE_ID_PREFIX.length).split('|');
  const offsetDays = Number(days);
  if (!Number.isInteger(offsetDays) || !time || !isValidTime(time)) return null;
  return { offsetDays, time };
}

export default function ReminderQuickMenu({ reminders: rawReminders, dueTime, onChange, children, style }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const accentText = selectionCheckColor(accent);
  const presentDateTimePicker = useNativeDateTimePicker();
  const reminders = normalizeReminders(rawReminders);
  const presets = useMemo(() => reminderPresets(dueTime), [dueTime]);
  const presetKeys = useMemo(() => new Set(presets.map(reminderKey)), [presets]);
  const customReminders = reminders.filter((reminder) => !presetKeys.has(reminderKey(reminder)));
  const [customOpen, setCustomOpen] = useState(false);
  const [customDays, setCustomDays] = useState('1');
  const [customTime, setCustomTime] = useState(DEFAULT_REMINDER_TIME);
  const customOffset = Number(customDays);
  const customTimeValid = isValidTime(customTime);
  const customValid =
    /^\d+$/.test(customDays) &&
    Number.isInteger(customOffset) &&
    customOffset >= 0 &&
    customOffset <= 3650 &&
    customTimeValid;
  const customExists = customValid && hasReminder(reminders, { offsetDays: customOffset, time: customTime });

  const add = (offsetDays: number, time: string) => {
    if (hasReminder(reminders, { offsetDays, time })) return;
    onChange([...reminders, createReminder(offsetDays, time)]);
  };

  const removeById = (id: string) => {
    onChange(reminders.filter((reminder) => reminder.id !== id));
  };

  const toggle = (offsetDays: number, time: string) => {
    const existing = reminders.find((reminder) => reminder.offsetDays === offsetDays && reminder.time === time);
    if (existing) removeById(existing.id);
    else add(offsetDays, time);
  };

  const openCustom = () => {
    Keyboard.dismiss();
    setCustomOpen(true);
  };

  const pickTime = () => {
    Keyboard.dismiss();
    presentDateTimePicker({
      mode: 'time',
      date: toISODate(new Date()),
      time: customTimeValid ? customTime : DEFAULT_REMINDER_TIME,
      onChange: (_, time) => {
        if (time) setCustomTime(time);
      },
    });
  };

  const addCustom = () => {
    if (!customValid || customExists) return;
    add(customOffset, customTime);
    setCustomOpen(false);
  };

  const actions: MenuAction[] = [
    {
      title: 'Presets',
      displayInline: true,
      subactions: presets.map((preset) => ({
        id: presetToggleId(preset),
        title: preset.label,
        state: hasReminder(reminders, preset) ? 'on' as const : 'off' as const,
      })),
    },
    ...(customReminders.length > 0
      ? [
          {
            title: 'Custom',
            displayInline: true,
            subactions: customReminders.map((reminder) => ({
              id: `remove:${reminder.id}`,
              title: formatReminder(reminder),
              state: 'on' as const,
            })),
          },
        ]
      : []),
    { id: 'custom', title: 'Custom...', image: 'slider.horizontal.3' as const },
    ...(reminders.length > 0
      ? [{ id: 'clear', title: 'Clear all', image: 'xmark.circle' as const, attributes: { destructive: true } }]
      : []),
  ];

  const handleAction = ({ nativeEvent }: NativeActionEvent) => {
    const id = nativeEvent.event;
    if (id === 'custom') {
      openCustom();
      return;
    }
    if (id === 'clear') {
      onChange([]);
      return;
    }
    if (id.startsWith('remove:')) {
      removeById(id.slice('remove:'.length));
      return;
    }
    const preset = parsePresetToggleId(id);
    if (preset) {
      toggle(preset.offsetDays, preset.time);
    }
  };

  const trigger =
    Platform.OS === 'web' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reminders"
        style={style}
        onPress={openCustom}
      >
        {children}
      </Pressable>
    ) : (
      <MenuView title="Reminders" actions={actions} onPressAction={handleAction} style={style}>
        {children}
      </MenuView>
    );

  return (
    <>
      {trigger}
      <NativeSheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom reminder"
        keyboard
        stackBehavior="push"
      >
        <View style={styles.sheetBody}>
          <View style={styles.dayPresetRow}>
            {REMINDER_DAY_PRESETS.map((preset) => {
              const value = String(preset.offsetDays);
              const active = customDays === value;
              return (
                <Pressable
                  key={value}
                  style={[
                    styles.dayPresetButton,
                    { borderColor: active ? accent : colors.border },
                    active && { backgroundColor: accent },
                  ]}
                  onPress={() => setCustomDays(value)}
                >
                  <Text style={[styles.dayPresetText, { color: active ? accentText : colors.textSecondary }]}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.customRow}>
            <NativeOwnedTextInput
              sheet
              value={customDays}
              onChangeText={(value) => setCustomDays(value.replace(/\D/g, '').slice(0, 4))}
              placeholder="1"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              style={styles.daysInput}
            />
            <Text style={styles.customText}>days before at</Text>
            <Pressable style={styles.timeButton} onPress={pickTime}>
              <Text style={[styles.timeButtonText, { color: accent }]}>
                {customTimeValid ? formatTime24to12(customTime) : customTime}
              </Text>
            </Pressable>
          </View>

          <View style={styles.timePresetRow}>
            {REMINDER_TIME_PRESETS.map((preset) => {
              const active = customTime === preset.time;
              return (
                <Pressable
                  key={preset.time}
                  style={[
                    styles.timePresetButton,
                    { borderColor: active ? accent : colors.border },
                    active && { backgroundColor: accent },
                  ]}
                  onPress={() => setCustomTime(preset.time)}
                >
                  <Text style={[styles.timePresetText, { color: active ? accentText : colors.textSecondary }]}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <NativeOwnedTextInput
            sheet
            value={customTime}
            onChangeText={(value) => setCustomTime(value.trim().slice(0, 5))}
            placeholder="HH:MM"
            placeholderTextColor={colors.textFaint}
            style={styles.timeInput}
          />

          {customExists && <Text style={styles.hint}>That reminder is already set.</Text>}
          {!customTimeValid && <Text style={styles.hint}>Use 24-hour time, like 09:00.</Text>}

          <Pressable
            disabled={!customValid || customExists}
            style={[
              styles.addButton,
              { backgroundColor: customValid && !customExists ? accent : colors.chipBg },
            ]}
            onPress={addCustom}
          >
            <Text style={[styles.addText, { color: customValid && !customExists ? accentText : colors.textFaint }]}>
              Add reminder
            </Text>
          </Pressable>
        </View>
      </NativeSheet>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  sheetBody: {
    gap: 12,
  },
  dayPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayPresetButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    backgroundColor: c.surfaceMuted,
  },
  dayPresetText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  daysInput: {
    width: 58,
    minHeight: 38,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 7,
    paddingHorizontal: 10,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: c.textPrimary,
    backgroundColor: c.surfaceMuted,
  },
  customText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textSecondary,
  },
  timeButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 7,
    paddingHorizontal: 9,
    backgroundColor: c.surfaceMuted,
  },
  timeButtonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
  timePresetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timePresetButton: {
    minHeight: 32,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    backgroundColor: c.surfaceMuted,
  },
  timePresetText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  timeInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 11,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
    backgroundColor: c.surfaceMuted,
  },
  hint: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.textTertiary,
  },
  addButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  addText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
  },
}));

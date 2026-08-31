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
  isReminderTime,
  MAX_REMINDER_OFFSET_DAYS,
  REMINDER_DAY_PRESETS,
  REMINDER_TIME_PRESETS,
  createReminder,
  formatReminder,
  hasReminder,
  normalizeReminders,
  reminderKey,
  reminderOffsetLabel,
  reminderPresets,
} from '../../data/reminders';
import type { TaskReminder } from '../../data/types';
import { useNativeDateTimePicker } from '../../navigation/DateTimePickerContext';
import NativeSheet from '../NativeSheet';
import { IconMinus, IconPlus } from '../../icons/Icons';

const TOGGLE_ID_PREFIX = 'toggle|';

interface Props {
  reminders?: TaskReminder[];
  dueTime?: string;
  onChange: (reminders: TaskReminder[]) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

function presetToggleId(preset: Pick<TaskReminder, 'offsetDays' | 'time'>): string {
  return `${TOGGLE_ID_PREFIX}${preset.offsetDays}|${preset.time}`;
}

function parsePresetToggleId(id: string): Pick<TaskReminder, 'offsetDays' | 'time'> | null {
  if (!id.startsWith(TOGGLE_ID_PREFIX)) return null;
  const [days, time] = id.slice(TOGGLE_ID_PREFIX.length).split('|');
  const offsetDays = Number(days);
  if (!Number.isInteger(offsetDays) || !time || !isReminderTime(time)) return null;
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
  // Both are only ever written from a stepper, a chip, or the system time
  // picker, so neither can hold a value the model would reject — there is no
  // invalid state for the sheet to guard against or explain.
  const [customOffset, setCustomOffset] = useState(1);
  const [customTime, setCustomTime] = useState(DEFAULT_REMINDER_TIME);
  const customExists = hasReminder(reminders, { offsetDays: customOffset, time: customTime });

  const stepOffset = (by: number) => {
    setCustomOffset((current) => Math.min(MAX_REMINDER_OFFSET_DAYS, Math.max(0, current + by)));
  };

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
      time: customTime,
      onChange: (_, time) => {
        if (time) setCustomTime(time);
      },
    });
  };

  const addCustom = () => {
    if (customExists) return;
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
        stackBehavior="push"
        onCancel={() => setCustomOpen(false)}
        onConfirm={addCustom}
        confirmLabel="Add reminder"
        confirmDisabled={customExists}
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sectionLabel}>When</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={styles.stepperButton}
              onPress={() => stepOffset(-1)}
              disabled={customOffset === 0}
              accessibilityRole="button"
              accessibilityLabel="Fewer days before due"
            >
              <IconMinus size={18} color={customOffset === 0 ? colors.textFaint : colors.textPrimary} />
            </Pressable>
            <Text style={styles.stepperValue}>{reminderOffsetLabel(customOffset)}</Text>
            <Pressable
              style={styles.stepperButton}
              onPress={() => stepOffset(1)}
              disabled={customOffset === MAX_REMINDER_OFFSET_DAYS}
              accessibilityRole="button"
              accessibilityLabel="More days before due"
            >
              <IconPlus
                size={18}
                color={customOffset === MAX_REMINDER_OFFSET_DAYS ? colors.textFaint : colors.textPrimary}
              />
            </Pressable>
          </View>
          <View style={styles.chipRow}>
            {REMINDER_DAY_PRESETS.map((preset) => {
              const active = customOffset === preset.offsetDays;
              return (
                <Pressable
                  key={preset.offsetDays}
                  style={[
                    styles.chip,
                    { borderColor: active ? accent : colors.border },
                    active && { backgroundColor: accent },
                  ]}
                  onPress={() => setCustomOffset(preset.offsetDays)}
                >
                  <Text style={[styles.chipText, { color: active ? accentText : colors.textSecondary }]}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Time</Text>
          <Pressable
            style={styles.timeButton}
            onPress={pickTime}
            accessibilityRole="button"
            accessibilityLabel={`Reminder time, ${formatTime24to12(customTime)}`}
          >
            <Text style={[styles.timeButtonText, { color: accent }]}>{formatTime24to12(customTime)}</Text>
          </Pressable>
          <View style={styles.chipRow}>
            {REMINDER_TIME_PRESETS.map((preset) => {
              const active = customTime === preset.time;
              return (
                <Pressable
                  key={preset.time}
                  style={[
                    styles.chip,
                    { borderColor: active ? accent : colors.border },
                    active && { backgroundColor: accent },
                  ]}
                  onPress={() => setCustomTime(preset.time)}
                >
                  <Text style={[styles.chipText, { color: active ? accentText : colors.textSecondary }]}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* The reminders already on the task live in the menu, not here, so
              this is the only thing that explains a greyed-out Add. */}
          {customExists && <Text style={styles.hint}>That reminder is already set.</Text>}
        </View>
      </NativeSheet>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  sheetBody: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: c.textTertiary,
    marginTop: 4,
  },
  /** The readout, and the only place the offset can be set to an odd number. */
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    backgroundColor: c.surfaceMuted,
  },
  stepperButton: {
    width: 46,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: c.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    backgroundColor: c.surfaceMuted,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  timeButton: {
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: c.surfaceMuted,
  },
  timeButtonText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
  },
  hint: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.textTertiary,
  },
}));

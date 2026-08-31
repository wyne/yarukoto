import React, { useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import MenuView, { type MenuAction, type NativeActionEvent } from '@expo/ui/community/menu';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import Picker from '@expo/ui/community/picker';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors, useScheme } from '../../theme/ThemeContext';
import { formatTime24to12, toISODate } from '../../data/dateUtils';
import {
  DEFAULT_REMINDER_TIME,
  isReminderTime,
  createReminder,
  formatReminder,
  hasReminder,
  normalizeReminders,
  reminderKey,
  reminderOffsetOptions,
  reminderOffsetUnit,
  reminderPresets,
  snapReminderOffset,
  type ReminderOffsetUnit,
} from '../../data/reminders';
import type { TaskReminder } from '../../data/types';
import { useNativeDateTimePicker } from '../../navigation/DateTimePickerContext';
import NativeSheet from '../NativeSheet';

const TOGGLE_ID_PREFIX = 'toggle|';

const UNIT_TABS: ReminderOffsetUnit[] = ['day', 'week'];
const UNIT_TAB_LABELS: Record<ReminderOffsetUnit, string> = { day: 'Day', week: 'Week' };

/** iOS is the only platform whose spinner is a wheel; Material has none. */
const WHEEL_TIME = Platform.OS === 'ios';

/**
 * Wheel geometry, gathered here because it is the only lever on the selection
 * capsule. Each wheel hands its host width straight to the capsule drawn behind
 * the chosen rung, so these widths are the capsule widths.
 *
 * Deliberately overcorrected: narrow enough that the time wheel may compress,
 * to establish whether the capsule is bounded by the host at all. If the two
 * still meet at these numbers, the width is not what governs it.
 */
const WHEEL_HEIGHT = 216;
const OFFSET_WHEEL_WIDTH = 96;
const TIME_WHEEL_WIDTH = 132;
const WHEEL_GAP = 36;

/** The wheel is a clock, so only the time on this Date is ever read back. */
function dateForTime(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const value = new Date();
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function timeFromDate(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

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
  const scheme = useScheme();
  const presentDateTimePicker = useNativeDateTimePicker();
  const reminders = normalizeReminders(rawReminders);
  const presets = useMemo(() => reminderPresets(dueTime), [dueTime]);
  const presetKeys = useMemo(() => new Set(presets.map(reminderKey)), [presets]);
  const customReminders = reminders.filter((reminder) => !presetKeys.has(reminderKey(reminder)));
  const [customOpen, setCustomOpen] = useState(false);
  // Both are only ever written from a wheel rung, so neither can hold a value
  // the model would reject — there is no invalid state for the sheet to guard
  // against or explain.
  const [customOffset, setCustomOffset] = useState(1);
  const [customTime, setCustomTime] = useState(DEFAULT_REMINDER_TIME);
  const [offsetUnit, setOffsetUnit] = useState<ReminderOffsetUnit>('day');
  const offsetOptions = useMemo(() => reminderOffsetOptions(offsetUnit), [offsetUnit]);
  const customExists = hasReminder(reminders, { offsetDays: customOffset, time: customTime });

  // Switching units moves the wheel to the nearest rung the new one has, so the
  // selection stays somewhere the user can see rather than snapping to the top.
  const changeUnit = (unit: ReminderOffsetUnit) => {
    setOffsetUnit(unit);
    setCustomOffset((current) => snapReminderOffset(current, unit));
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
    setOffsetUnit(reminderOffsetUnit(customOffset));
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
          {/*
            Drawn here rather than with the native segmented control: that one
            is a SwiftUI Host, and inside the sheet it rendered but never took a
            tap. This also themes with the app instead of the system.
          */}
          <View style={styles.unitTabs}>
            {UNIT_TABS.map((unit) => {
              const active = unit === offsetUnit;
              return (
                <Pressable
                  key={unit}
                  style={[styles.unitTab, active && { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => changeUnit(unit)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.unitTabText,
                      { color: active ? colors.textPrimary : colors.textSecondary },
                    ]}
                  >
                    {UNIT_TAB_LABELS[unit]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.wheelRow}>
            {/*
              Values are strings because the SwiftUI wheel tags its rows with
              them, and hands back what it was tagged with — a numeric value
              would come back as its own string and never match an option.
            */}
            <Picker
              style={styles.offsetWheel}
              selectedValue={String(customOffset)}
              onValueChange={(value) => setCustomOffset(Number(value))}
            >
              {offsetOptions.map((option) => (
                <Picker.Item
                  key={option.offsetDays}
                  label={option.label}
                  value={String(option.offsetDays)}
                  color={colors.textPrimary}
                />
              ))}
            </Picker>

            {WHEEL_TIME && (
              <DateTimePicker
                value={dateForTime(customTime)}
                mode="time"
                display="spinner"
                accentColor={accent}
                themeVariant={scheme}
                onValueChange={(_, selected) => setCustomTime(timeFromDate(selected))}
                style={styles.timeWheel}
              />
            )}
          </View>

          {/* Off iOS the spinner is a text field rather than a wheel, so the
              time keeps the button through to the app's own picker screen. */}
          {!WHEEL_TIME && (
            <Pressable
              style={styles.timeButton}
              onPress={pickTime}
              accessibilityRole="button"
              accessibilityLabel={`Reminder time, ${formatTime24to12(customTime)}`}
            >
              <Text style={[styles.timeButtonText, { color: accent }]}>{formatTime24to12(customTime)}</Text>
            </Pressable>
          )}

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
    gap: 14,
    paddingTop: 4,
  },
  unitTabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 2,
    padding: 2,
    borderRadius: 9,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.divider,
  },
  unitTab: {
    minWidth: 96,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unitTabText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  /**
   * Centred rather than filled. Each wheel hands its host width straight to the
   * selection capsule drawn behind the chosen rung, so a wheel stretched across
   * half the sheet gets a capsule to match — reaching far past the words it is
   * meant to be marking. Sized to their contents instead, the capsules stop
   * near the text, and the gap keeps the two from meeting in the middle and
   * reading as one doubled highlight around the hour.
   */
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: WHEEL_GAP,
    marginTop: 4,
  },
  /**
   * Both wheels need a height: the SwiftUI picker and the UIDatePicker size
   * themselves independently, and matching them is what keeps the two sets of
   * rows on the same lines rather than drifting apart. Tall enough for two
   * rungs either side of the selected one, which is what makes a wheel read as
   * a wheel rather than as a cramped list.
   */
  offsetWheel: {
    width: OFFSET_WHEEL_WIDTH,
    height: WHEEL_HEIGHT,
  },
  timeWheel: {
    width: TIME_WHEEL_WIDTH,
    height: WHEEL_HEIGHT,
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
    textAlign: 'center',
  },
}));

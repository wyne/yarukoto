import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  DatePickerDialog,
  Host,
  TimePickerDialog,
  type DatePickerElementColors,
  type TimePickerElementColors,
} from '@expo/ui/jetpack-compose';
import { Palette, Scheme, selectionCheckColor } from '../../theme/colors';

type AndroidVariant = 'picker' | 'input';

interface Props {
  value: Date;
  mode: 'date' | 'time';
  display?: 'default' | 'spinner' | 'compact' | 'inline' | 'calendar' | 'clock';
  accentColor: string;
  colors: Palette;
  scheme: Scheme;
  positiveButton?: { label?: string };
  negativeButton?: { label?: string };
  onValueChange: (selected: Date) => void;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}

function displayToAndroidVariant(display: Props['display']): AndroidVariant {
  return display === 'spinner' ? 'input' : 'picker';
}

function pickerColors(
  colors: Palette,
  accent: string
): DatePickerElementColors & TimePickerElementColors {
  const onAccent = selectionCheckColor(accent);
  return {
    containerColor: colors.surface,
    titleContentColor: colors.textSecondary,
    headlineContentColor: colors.textPrimary,
    weekdayContentColor: colors.textSecondary,
    subheadContentColor: colors.textSecondary,
    navigationContentColor: colors.textPrimary,
    yearContentColor: colors.textPrimary,
    disabledYearContentColor: colors.textFaint,
    currentYearContentColor: accent,
    selectedYearContentColor: onAccent,
    disabledSelectedYearContentColor: colors.textFaint,
    selectedYearContainerColor: accent,
    disabledSelectedYearContainerColor: colors.chipBg,
    dayContentColor: colors.textPrimary,
    disabledDayContentColor: colors.textFaint,
    selectedDayContentColor: onAccent,
    disabledSelectedDayContentColor: colors.textFaint,
    selectedDayContainerColor: accent,
    disabledSelectedDayContainerColor: colors.chipBg,
    todayContentColor: accent,
    todayDateBorderColor: accent,
    dayInSelectionRangeContentColor: colors.textPrimary,
    dayInSelectionRangeContainerColor: colors.accentTintBg,
    dividerColor: colors.dividerStrong,
    clockDialColor: colors.surfaceMuted,
    clockDialSelectedContentColor: onAccent,
    clockDialUnselectedContentColor: colors.textPrimary,
    selectorColor: accent,
    periodSelectorBorderColor: colors.border,
    periodSelectorSelectedContainerColor: accent,
    periodSelectorUnselectedContainerColor: colors.surfaceMuted,
    periodSelectorSelectedContentColor: onAccent,
    periodSelectorUnselectedContentColor: colors.textSecondary,
    timeSelectorSelectedContainerColor: accent,
    timeSelectorUnselectedContainerColor: colors.surfaceMuted,
    timeSelectorSelectedContentColor: onAccent,
    timeSelectorUnselectedContentColor: colors.textPrimary,
  };
}

export default function ThemedAndroidDateTimeDialog({
  value,
  mode,
  display,
  accentColor,
  colors,
  scheme,
  positiveButton,
  negativeButton,
  onValueChange,
  onDismiss,
  style,
}: Props) {
  const dialogProps = {
    initialDate: value.toISOString(),
    color: accentColor,
    elementColors: pickerColors(colors, accentColor),
    confirmButtonLabel: positiveButton?.label,
    dismissButtonLabel: negativeButton?.label,
    onDateSelected: onValueChange,
    onDismissRequest: onDismiss,
  } as const;

  return (
    <Host colorScheme={scheme} seedColor={accentColor} style={style}>
      {mode === 'time' ? (
        <TimePickerDialog {...dialogProps} />
      ) : (
        <DatePickerDialog {...dialogProps} variant={displayToAndroidVariant(display)} />
      )}
    </Host>
  );
}

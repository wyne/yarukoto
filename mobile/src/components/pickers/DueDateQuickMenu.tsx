import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MenuView, { type MenuAction, type NativeActionEvent } from '@expo/ui/community/menu';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { addDays, formatDueFull, formatTime24to12, toISODate } from '../../data/dateUtils';

const QUICK_DATES: { id: string; label: string; get: (now: Date) => string }[] = [
  { id: 'today', label: 'Today', get: (now) => toISODate(now) },
  { id: 'tomorrow', label: 'Tomorrow', get: (now) => toISODate(addDays(now, 1)) },
  { id: 'next-week', label: 'Next week', get: (now) => toISODate(addDays(now, 7)) },
  { id: 'this-weekend', label: 'This weekend', get: (now) => toISODate(addDays(now, (6 - now.getDay() + 7) % 7 || 6)) },
];

interface Props {
  date?: string;
  time?: string;
  onChange: (date: string | undefined, time: string | undefined) => void;
  onCustomDate: () => void;
  onCustomTime?: () => void;
  onDone?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function DueDateQuickMenu({
  date,
  time,
  onChange,
  onCustomDate,
  onCustomTime,
  onDone,
  children,
  style,
}: Props) {
  const accent = useAccent();
  const now = new Date();
  const quickValues = Object.fromEntries(QUICK_DATES.map((item) => [item.id, item.get(now)]));

  const actions: MenuAction[] = [
    ...QUICK_DATES.map((item) => ({
      id: item.id,
      title: item.label,
      image: 'calendar' as const,
      state: quickValues[item.id] === date ? ('on' as const) : undefined,
    })),
    ...(date && onCustomTime
      ? [
          {
            id: 'time',
            title: time ? `Time: ${formatTime24to12(time)}` : 'Time',
            image: 'clock' as const,
          },
        ]
      : []),
    {
      id: 'custom',
      title: 'Pick date',
      image: 'calendar.badge.plus' as const,
    },
    {
      id: 'clear',
      title: 'Clear',
      image: 'xmark.circle' as const,
      state: !date ? ('on' as const) : undefined,
      attributes: date || time ? { destructive: true } : undefined,
    },
  ];

  const handleAction = (event: NativeActionEvent) => {
    const id = event.nativeEvent.event;
    const quickDate = quickValues[id];

    if (quickDate) {
      onChange(quickDate, time);
      onDone?.();
      return;
    }
    if (id === 'time') {
      onCustomTime?.();
      return;
    }
    if (id === 'custom') {
      onCustomDate();
      return;
    }
    if (id === 'clear') {
      onChange(undefined, undefined);
      onDone?.();
    }
  };

  const trigger = children ?? (
    <View style={styles.trigger}>
      <Text style={[styles.triggerText, date && { color: accent }]}>{formatDueFull(date, time)}</Text>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <Pressable onPress={onCustomDate} style={[styles.webFallback, style]}>
        {trigger}
      </Pressable>
    );
  }

  return (
    <MenuView actions={actions} onPressAction={handleAction} style={style}>
      {trigger}
    </MenuView>
  );
}

const styles = StyleSheet.create({
  webFallback: {
    alignSelf: 'flex-end',
  },
  trigger: {
    minHeight: 30,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  triggerText: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});

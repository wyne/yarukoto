import React from 'react';
import { Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MenuView, { type MenuAction, type NativeActionEvent } from '@expo/ui/community/menu';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { formatDueFull, formatTime24to12 } from '../../data/dateUtils';
import WebDateTimeQuickMenu from './WebDateTimeQuickMenu';
import { QUICK_DATES } from './dateTimeQuickOptions';

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
  const styles = useStyles();
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
      <WebDateTimeQuickMenu
        mode="date"
        date={date}
        time={time}
        showTimeShortcut={!!onCustomTime}
        onChange={onChange}
        onDone={onDone}
        style={[styles.webFallback, style]}
      >
        {trigger}
      </WebDateTimeQuickMenu>
    );
  }

  return (
    <MenuView actions={actions} onPressAction={handleAction} style={style}>
      {trigger}
    </MenuView>
  );
}

const useStyles = makeStyles((c) => ({
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
    fontSize: 14,
    color: c.textSecondary,
  },
}));

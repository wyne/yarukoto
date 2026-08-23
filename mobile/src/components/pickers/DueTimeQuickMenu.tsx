import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import MenuView, { type MenuAction, type NativeActionEvent } from '@expo/ui/community/menu';
import WebDateTimeQuickMenu from './WebDateTimeQuickMenu';
import { QUICK_TIMES } from './dateTimeQuickOptions';

interface Props {
  time?: string;
  onChange: (time: string | undefined) => void;
  onPickTime: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function DueTimeQuickMenu({ time, onChange, onPickTime, children, style }: Props) {
  const actions: MenuAction[] = [
    ...QUICK_TIMES.map((item) => ({
      id: item.id,
      title: item.label,
      image: 'clock' as const,
      state: item.id === time ? ('on' as const) : undefined,
    })),
    {
      id: 'pick',
      title: 'Pick time',
      image: 'clock' as const,
    },
    {
      id: 'clear',
      title: 'Clear',
      image: 'xmark.circle' as const,
      state: !time ? ('on' as const) : undefined,
      attributes: time ? { destructive: true } : undefined,
    },
  ];

  const handleAction = (event: NativeActionEvent) => {
    const id = event.nativeEvent.event;

    if (QUICK_TIMES.some((item) => item.id === id)) {
      onChange(id);
      return;
    }
    if (id === 'pick') {
      onPickTime();
      return;
    }
    if (id === 'clear') {
      onChange(undefined);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <WebDateTimeQuickMenu
        mode="time"
        time={time}
        accessibilityLabel={time ? `Time, ${time}` : 'Time, none'}
        onChange={(_, dueTime) => onChange(dueTime)}
        style={style}
      >
        {children}
      </WebDateTimeQuickMenu>
    );
  }

  return (
    <MenuView actions={actions} onPressAction={handleAction} style={style}>
      {children}
    </MenuView>
  );
}

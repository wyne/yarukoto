import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import MenuView, { type MenuAction, type NativeActionEvent } from '../NativeMenu';
import WebDateTimeQuickMenu from './WebDateTimeQuickMenu';
import { QUICK_TIMES } from './dateTimeQuickOptions';

interface Props {
  time?: string;
  onChange: (time: string | undefined) => void;
  onPickTime: () => void;
  /** Called once a choice is made in the menu itself, so a field can take focus back. */
  onDone?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function DueTimeQuickMenu({ time, onChange, onPickTime, onDone, children, style }: Props) {
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
      onDone?.();
      return;
    }
    if (id === 'pick') {
      onPickTime();
      return;
    }
    if (id === 'clear') {
      onChange(undefined);
      onDone?.();
    }
  };

  if (Platform.OS === 'web') {
    return (
      <WebDateTimeQuickMenu
        mode="time"
        time={time}
        accessibilityLabel={time ? `Time, ${time}` : 'Time, none'}
        onChange={(_, dueTime) => onChange(dueTime)}
        onDone={onDone}
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

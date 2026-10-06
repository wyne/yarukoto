import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Palette, Scheme } from '../../theme/colors';

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

export default function ThemedAndroidDateTimeDialog(_props: Props) {
  return null;
}

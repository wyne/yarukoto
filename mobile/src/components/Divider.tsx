import React from 'react';
import { View } from 'react-native';
import { useColors } from '../theme/ThemeContext';

interface Props {
  /** Left inset. Zero squares off the edge of a tinted row above or below it. */
  indent?: number;
  /** Overrides the line's colour, to carry a tint across it. */
  color?: string;
}

export default function Divider({ indent = 46, color }: Props) {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: color ?? colors.divider, marginLeft: indent }} />;
}

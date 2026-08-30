import React from 'react';
import { View } from 'react-native';
import { useColors } from '../theme/ThemeContext';

interface Props {
  /** Left inset. Zero squares off the edge of a tinted row above or below it. */
  indent?: number;
  /** Overrides the line's colour, to carry a tint across it. */
  color?: string;
  /** Continues a task row's list rail through the divider gap. */
  railColor?: string;
}

export default function Divider({ indent = 46, color, railColor }: Props) {
  const colors = useColors();
  return (
    <View style={{ height: 1 }}>
      <View style={{ height: 1, backgroundColor: color ?? colors.divider, marginLeft: indent }} />
      {!!railColor && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 3, backgroundColor: railColor }}
        />
      )}
    </View>
  );
}

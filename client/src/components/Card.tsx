import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { makeStyles } from '../theme/styles';

export default function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
}));

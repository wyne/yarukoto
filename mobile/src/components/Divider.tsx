import React from 'react';
import { View } from 'react-native';
import { colors } from '../theme/colors';

export default function Divider({ indent = 46 }: { indent?: number }) {
  return <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: indent }} />;
}

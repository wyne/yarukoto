import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { IconCalendarBox, IconFolder, IconTag, IconTrash } from '../icons/Icons';

interface Props {
  onSchedule: () => void;
  onMove: () => void;
  onTag: () => void;
  onDelete: () => void;
}

export default function BulkActionBar({ onSchedule, onMove, onTag, onDelete }: Props) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const items = [
    { key: 'schedule', label: 'Schedule', icon: <IconCalendarBox size={19} color={accent} strokeWidth={1.6} />, color: accent, onPress: onSchedule },
    { key: 'move', label: 'Move', icon: <IconFolder size={19} color={accent} strokeWidth={1.6} />, color: accent, onPress: onMove },
    { key: 'tag', label: 'Tag', icon: <IconTag size={19} color={accent} strokeWidth={1.6} />, color: accent, onPress: onTag },
    { key: 'delete', label: 'Delete', icon: <IconTrash size={19} color={colors.priorityHigh} strokeWidth={1.6} />, color: colors.priorityHigh, onPress: onDelete },
  ];
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(10, insets.bottom) }]}>
      {items.map((it) => (
        <Pressable key={it.key} style={styles.item} onPress={it.onPress}>
          {it.icon}
          <Text style={[styles.label, { color: it.color }]}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
  },
});

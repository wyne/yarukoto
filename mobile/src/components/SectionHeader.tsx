import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { IconChevronDown } from '../icons/Icons';

interface Props {
  label: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function SectionHeader({ label, collapsed, onToggle }: Props) {
  const content = (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
      {onToggle && (
        <View style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}>
          <IconChevronDown />
        </View>
      )}
    </View>
  );
  if (!onToggle) return content;
  return <Pressable onPress={onToggle}>{content}</Pressable>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.dividerStrong,
  },
});

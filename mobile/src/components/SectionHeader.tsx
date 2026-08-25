import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { IconChevronDown } from '../icons/Icons';

interface Props {
  label: string;
  /** Shown at the far right, after the rule. */
  count?: number;
  /** Swatch before the label — used for list colours when grouping by list. */
  color?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function SectionHeader({ label, count, color, collapsed, onToggle }: Props) {
  const styles = useStyles();
  const chevronStyle = useAnimatedStyle(
    () => ({
      transform: [{ rotate: withTiming(collapsed ? '-90deg' : '0deg', { duration: 160 }) }],
    }),
    [collapsed]
  );

  const content = (
    <View style={styles.row}>
      {color && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
      {count !== undefined && <Text style={styles.count}>{count}</Text>}
      {onToggle && (
        <Animated.View style={chevronStyle}>
          <IconChevronDown />
        </Animated.View>
      )}
    </View>
  );
  if (!onToggle) return content;
  return <Pressable onPress={onToggle}>{content}</Pressable>;
}

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    color: c.textTertiary,
    textTransform: 'uppercase',
  },
  count: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: c.textFaint,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: c.dividerStrong,
  },
}));

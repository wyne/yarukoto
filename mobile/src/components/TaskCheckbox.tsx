import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { colors, priorityColor } from '../theme/colors';
import { Priority } from '../data/types';
import { hapticAction } from '../data/haptics';
import { IconCheckBig } from '../icons/Icons';

interface Props {
  completed: boolean;
  priority: Priority;
  onPress: () => void;
  size?: number;
}

export default function TaskCheckbox({ completed, priority, onPress, size = 20 }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    hapticAction();
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.75, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} hitSlop={10}>
      <Animated.View
        style={[
          styles.base,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale }],
          },
          completed
            ? { backgroundColor: colors.success }
            : { borderWidth: 2, borderColor: priorityColor(priority) },
        ]}
      >
        {completed && <IconCheckBig size={Math.round(size * 0.6)} color="#fff" strokeWidth={2} />}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

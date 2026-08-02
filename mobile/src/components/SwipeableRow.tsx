import React, { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { IconCalendarBox, IconCheckBig } from '../icons/Icons';

const ACTION_WIDTH = 66;
const OPEN_X = -ACTION_WIDTH * 2;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

interface Props {
  children: React.ReactNode;
  onLater: () => void;
  onDone: () => void;
  disabled?: boolean;
}

export default function SwipeableRow({ children, onLater, onDone, disabled }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);
  const [open, setOpen] = useState(false);

  const animateTo = (toValue: number) => {
    currentX.current = toValue;
    setOpen(toValue !== 0);
    Animated.spring(translateX, { toValue, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => open,
      onMoveShouldSetPanResponder: (_, g) => !disabled && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const next = clamp(currentX.current + g.dx, OPEN_X, 0);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        if (open && Math.abs(g.dx) < 4) {
          animateTo(0);
          return;
        }
        const next = clamp(currentX.current + g.dx, OPEN_X, 0);
        animateTo(next < OPEN_X / 2 ? OPEN_X : 0);
      },
    })
  ).current;

  const runAction = (fn: () => void) => {
    animateTo(0);
    fn();
  };

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.action, { backgroundColor: colors.swipeLater }]} onPress={() => runAction(onLater)}>
            <IconCalendarBox size={18} color="#fff" strokeWidth={1.6} />
            <Text style={styles.actionLabel}>Later</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.action, { backgroundColor: colors.swipeDone }]} onPress={() => runAction(onDone)}>
            <IconCheckBig size={18} color="#fff" strokeWidth={2} />
            <Text style={styles.actionLabel}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Animated.View
        style={[styles.foreground, { transform: [{ translateX }] }]}
        {...(disabled ? {} : panResponder.panHandlers)}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.chipBg,
  },
  actionsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  foreground: {
    backgroundColor: colors.surface,
  },
});

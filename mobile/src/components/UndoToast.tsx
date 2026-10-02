import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { usePendingUndo, useTasks } from '../data/TaskContext';
import { IconCheckBig, IconTrash } from '../icons/Icons';
import { useSidebar } from '../navigation/SidebarContext';
import { nativeTabBarClearance } from '../navigation/nativeTabBarLayout';
import { FLOATING_TAB_BAR } from '../data/platform';

const NATIVE_DRIVER = Platform.OS !== 'web';

export default function UndoToast() {
  const styles = useStyles();
  const pendingUndo = usePendingUndo();
  const { undo } = useTasks();
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const { wide } = useSidebar();

  const anim = useRef(new Animated.Value(0)).current;
  const token = pendingUndo?.token ?? null;

  useEffect(() => {
    anim.setValue(0);
    if (token === null) return;
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: NATIVE_DRIVER }).start();
  }, [token, anim]);

  if (!pendingUndo) return null;

  return (
    <View
      style={[
        styles.wrap,
        { bottom: wide || !FLOATING_TAB_BAR ? insets.bottom + 20 : nativeTabBarClearance(insets.bottom) },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[
          styles.toast,
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        {pendingUndo.kind === 'delete' ? (
          <View style={[styles.check, styles.trash]}>
            <IconTrash size={11} color="#fff" strokeWidth={2} />
          </View>
        ) : (
          <View style={styles.check}>
            <IconCheckBig size={12} color="#fff" strokeWidth={2.4} />
          </View>
        )}
        <Text style={styles.label} numberOfLines={1}>
          {pendingUndo.title}
        </Text>
        <Pressable onPress={undo} hitSlop={10}>
          <Text style={[styles.undo, { color: accent }]}>Undo</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 420,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: c.inverseSurface,
    shadowColor: c.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trash: {
    backgroundColor: c.priorityHigh,
  },
  label: {
    flexShrink: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14.5,
    color: c.inverseText,
  },
  undo: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14.5,
  },
}));

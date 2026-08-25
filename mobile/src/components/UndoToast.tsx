import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import { IconCheckBig } from '../icons/Icons';
import { useSidebar } from '../navigation/SidebarContext';
import { nativeTabBarClearance } from '../navigation/nativeTabBarLayout';
import { WEB_ENTRY } from '../data/platform';

const NATIVE_DRIVER = Platform.OS !== 'web';

export default function UndoToast() {
  const { pendingUndo, undoComplete } = useTasks();
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
        { bottom: wide || WEB_ENTRY ? insets.bottom + 20 : nativeTabBarClearance(insets.bottom) },
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
        <View style={styles.check}>
          <IconCheckBig size={12} color="#fff" strokeWidth={2.4} />
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {pendingUndo.title}
        </Text>
        <Pressable onPress={undoComplete} hitSlop={10}>
          <Text style={[styles.undo, { color: accent }]}>Undo</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.textPrimary,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14.5,
    color: '#fff',
  },
  undo: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14.5,
  },
});

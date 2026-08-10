import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSidebar } from '../navigation/SidebarContext';
import Sidebar, { SIDEBAR_WIDTH } from './Sidebar';

const NATIVE_DRIVER = Platform.OS !== 'web';
const DURATION = 200;

/** Narrow-layout wrapper: slides the sidebar in from the left over the current screen. */
export default function SidebarDrawer(props: BottomTabBarProps) {
  const { drawerOpen, closeDrawer } = useSidebar();
  const slide = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;
  // Kept mounted through the closing animation so the panel slides out instead of vanishing.
  const [mounted, setMounted] = useState(drawerOpen);

  useEffect(() => {
    if (drawerOpen) setMounted(true);
    const to = drawerOpen ? 0 : -SIDEBAR_WIDTH;
    Animated.parallel([
      Animated.timing(slide, { toValue: to, duration: DURATION, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(fade, { toValue: drawerOpen ? 1 : 0, duration: DURATION, useNativeDriver: NATIVE_DRIVER }),
    ]).start(({ finished }) => {
      if (finished && !drawerOpen) setMounted(false);
    });
  }, [drawerOpen, slide, fade]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={closeDrawer}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>
      <Animated.View style={[styles.panel, { transform: [{ translateX: slide }] }]}>
        <Sidebar {...props} onNavigate={closeDrawer} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(20,20,15,0.35)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
  },
});

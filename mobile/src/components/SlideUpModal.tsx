import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  ViewStyle,
} from 'react-native';

const NATIVE_DRIVER = Platform.OS !== 'web';
const DURATION = 250;

interface Props {
  visible: boolean;
  onClose: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Modal that slides a sheet up from the bottom while the backdrop fades in place.
 * Modal's own `animationType="slide"` moves the backdrop along with the sheet,
 * which reads as the shading sliding in rather than the screen dimming.
 */
export default function SlideUpModal({ visible, onClose, sheetStyle, children }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  // Kept mounted through the closing animation so the sheet slides out instead of vanishing.
  const [mounted, setMounted] = useState(visible);
  // Travel distance: known only once the sheet has laid out.
  const [sheetHeight, setSheetHeight] = useState(0);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    // Hold the sheet offscreen until it has been measured, so it never flashes in place.
    if (visible && sheetHeight === 0) return;
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: DURATION,
      useNativeDriver: NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, mounted, sheetHeight, progress]);

  const onSheetLayout = (e: LayoutChangeEvent) => setSheetHeight(e.nativeEvent.layout.height);

  if (!mounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight || windowHeight, 0],
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, sheetStyle, { transform: [{ translateY }] }]}
        onLayout={onSheetLayout}
      >
        {children}
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
  sheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
  },
});

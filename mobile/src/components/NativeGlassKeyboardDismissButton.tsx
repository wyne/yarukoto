import React from 'react';
import { Keyboard, Platform, Pressable, StyleProp, StyleSheet, ViewStyle, requireNativeComponent } from 'react-native';
import { colors } from '../theme/colors';
import { IconChevronDown } from '../icons/Icons';

type Props = {
  style?: StyleProp<ViewStyle>;
};

const IOSNativeGlassKeyboardDismissButton =
  Platform.OS === 'ios'
    ? requireNativeComponent<Props>('NativeGlassKeyboardDismissButton')
    : null;

export default function NativeGlassKeyboardDismissButton({ style }: Props) {
  if (Platform.OS === 'ios' && IOSNativeGlassKeyboardDismissButton) {
    return <IOSNativeGlassKeyboardDismissButton style={[styles.nativeButton, style]} />;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss keyboard"
      style={[styles.fallbackButton, style]}
      onPress={() => Keyboard.dismiss()}
      hitSlop={8}
    >
      <IconChevronDown size={20} color={colors.textPrimary} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nativeButton: {
    width: 56,
    height: 48,
  },
  fallbackButton: {
    width: 46,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
  },
});

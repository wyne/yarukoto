import { Keyboard, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { colors } from '../theme/colors';
import { LIQUID_GLASS } from '../data/platform';
import { IconChevronDown } from '../icons/Icons';

type Props = {
  style?: StyleProp<ViewStyle>;
};

/**
 * Sends the keyboard away from a sheet full of fields.
 *
 * The wrapper claims the touch itself rather than leaving it to the button: the
 * control floats over a scroll view inside a bottom sheet, and a swipe that
 * starts here must not become a scroll or a sheet drag.
 */
export default function KeyboardDismissButton({ style }: Props) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel="Dismiss keyboard"
      style={[styles.hitShield, style]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderRelease={() => Keyboard.dismiss()}
    >
      {LIQUID_GLASS ? (
        <GlassView style={styles.glassButton} isInteractive>
          <IconChevronDown size={20} color={colors.textPrimary} strokeWidth={2.2} />
        </GlassView>
      ) : (
        <Pressable style={styles.fallbackButton} onPress={() => Keyboard.dismiss()}>
          <IconChevronDown size={20} color={colors.textPrimary} strokeWidth={2.2} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hitShield: {
    width: 64,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassButton: {
    width: 52,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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

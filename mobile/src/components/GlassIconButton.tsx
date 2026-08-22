import { ReactNode, Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import { LIQUID_GLASS } from '../data/platform';
import { hoverBg } from '../theme/hover';

/** Diameter of the glass capsule. Apple's minimum comfortable target. */
const SIZE = 36;

/**
 * Gap between capsules in a group, and the distance at which the glass in a
 * group starts to flow together. Spacing above the gap is what fuses a row of
 * capsules into one bar, the way the system toolbars read.
 */
const GROUP_GAP = 6;
const GROUP_SPACING = 10;

interface Props {
  onPress: () => void;
  /** Names the control for screen readers; icons have no text to fall back on. */
  label: string;
  /** The icon. Anything that draws itself in a {@link SIZE}-point circle. */
  children: ReactNode;
  ref?: Ref<View>;
}

/**
 * A header icon button: a Liquid Glass capsule on iOS 26, a bare icon anywhere
 * else.
 *
 * The two paths differ in more than material. Glass needs a shape to be glass
 * *in*, so it takes real space in the header; the flat one stays a bare icon
 * with a hover pad that costs no layout, which is what the web and Android
 * headers have always looked like. Press feedback follows the same split —
 * `isInteractive` hands it to UIKit, which morphs the glass under the finger,
 * while the flat path keeps the pointer hover tint that a mouse expects.
 */
export default function GlassIconButton({ onPress, label, children, ref }: Props) {
  if (!LIQUID_GLASS) {
    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={hoverBg(styles.flatButton)}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.glassPress}
    >
      <GlassView style={styles.glassButton} isInteractive>
        {children}
      </GlassView>
    </Pressable>
  );
}

/**
 * Sits adjacent header buttons in one glass group, so their capsules merge as
 * they near each other instead of each refracting the background on its own.
 *
 * Off glass it is a plain row, spaced the way the headers already space them.
 */
export function GlassIconButtonGroup({ children }: { children: ReactNode }) {
  if (!LIQUID_GLASS) return <View style={styles.flatGroup}>{children}</View>;

  return (
    <GlassContainer spacing={GROUP_SPACING} style={styles.glassGroup}>
      {children}
    </GlassContainer>
  );
}

const styles = StyleSheet.create({
  /**
   * The glass is the shape, so the capsule's size lives on it rather than on the
   * press target — its `borderRadius` is what rounds the effect itself, and a
   * radius set on an ancestor would leave the glass a square.
   */
  glassPress: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassButton: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * A bare icon has nothing to tint, so the button grows a padded, rounded area
   * to hover against. The matching negative margin keeps that off the layout, so
   * the header spaces itself exactly as it did before.
   */
  flatButton: {
    padding: 6,
    margin: -6,
    borderRadius: 8,
  },
  glassGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GROUP_GAP,
  },
  flatGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});

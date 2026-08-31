import { createContext, ReactNode, Ref, useContext } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import { LIQUID_GLASS } from '../data/platform';
import { useHoverBg } from '../theme/hover';

/** Diameter of the glass capsule and the standard iOS touch target. */
const SIZE = 44;

/**
 * Height of the compact text capsule. Secondary controls that sit in a filter
 * row above the content they filter, rather than in a header, where a full 44pt
 * capsule reads as a header bar of its own and eats the day view below it.
 */
const COMPACT_SIZE = 32;

/**
 * Gap between capsules in a group, and the distance at which the glass in a
 * group starts to flow together. Spacing above the gap is what fuses a row of
 * capsules into one bar, the way the system toolbars read.
 */
const GROUP_GAP = 6;
const GROUP_SPACING = 10;
const JoinedGlassGroupContext = createContext(false);

const COMPACT_SLOP = { top: (SIZE - COMPACT_SIZE) / 2, bottom: (SIZE - COMPACT_SIZE) / 2 };

interface Props {
  onPress: () => void;
  /** Names the control for screen readers; icons have no text to fall back on. */
  label: string;
  /** The icon. Anything that draws itself in a {@link SIZE}-point circle. */
  children: ReactNode;
  /** Optional tint for prominent glass actions. */
  tintColor?: string;
  disabled?: boolean;
  ref?: Ref<View>;
}

interface TextButtonProps {
  onPress: () => void;
  label: string;
  children: ReactNode;
  /** Shrinks the capsule to {@link COMPACT_SIZE} for a secondary control. */
  compact?: boolean;
}

interface MenuLabelProps {
  label: string;
  children: ReactNode;
}

interface TextMenuLabelProps extends MenuLabelProps {
  /** Shrinks the capsule to {@link COMPACT_SIZE} for a secondary control. */
  compact?: boolean;
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
export default function GlassIconButton({ onPress, label, children, tintColor, disabled = false, ref }: Props) {
  const hoverBg = useHoverBg();
  const joined = useContext(JoinedGlassGroupContext);

  if (!LIQUID_GLASS) {
    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={disabled ? { disabled: true } : undefined}
        style={
          tintColor
            ? [styles.flatButton, styles.tintedFallback, { backgroundColor: tintColor }, disabled && styles.disabled]
            : hoverBg([styles.flatButton, disabled && styles.disabled])
        }
      >
        {children}
      </Pressable>
    );
  }

  if (joined) {
    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={disabled ? { disabled: true } : undefined}
        style={[styles.joinedButton, disabled && styles.disabled]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={[styles.glassPress, disabled && styles.disabled]}
    >
      <GlassView style={styles.glassButton} tintColor={tintColor} isInteractive={!disabled}>
        {children}
      </GlassView>
    </Pressable>
  );
}

/**
 * The visual label for a system-owned menu trigger.
 *
 * The native menu supplies the gesture and accessibility action, so this stays
 * deliberately non-pressable. That leaves SwiftUI or Compose in sole control of
 * the touch sequence and gives their menu transition the trigger view to animate.
 */
export function GlassIconMenuLabel({ label, children }: MenuLabelProps) {
  if (!LIQUID_GLASS) {
    return (
      <View
        pointerEvents="none"
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.menuLabel}
      >
        {children}
      </View>
    );
  }

  return (
    <View pointerEvents="none" accessible accessibilityRole="button" accessibilityLabel={label}>
      <GlassView style={styles.glassButton}>{children}</GlassView>
    </View>
  );
}

/** Text label for a native menu trigger, keeping the menu gesture system-owned. */
export function GlassTextMenuLabel({ label, children, compact = false }: TextMenuLabelProps) {
  if (!LIQUID_GLASS) {
    return (
      <View
        pointerEvents="none"
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.flatTextMenuLabel, compact && styles.flatTextMenuCompact]}
      >
        {children}
      </View>
    );
  }

  return (
    <View pointerEvents="none" accessible accessibilityRole="button" accessibilityLabel={label}>
      <GlassView style={[styles.glassTextButton, compact && styles.glassTextCompact]}>{children}</GlassView>
    </View>
  );
}

/** A compact text action that uses the same native glass treatment as header icons. */
export function GlassTextButton({ onPress, label, children, compact = false }: TextButtonProps) {
  if (!LIQUID_GLASS) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.flatTextButton}
      >
        {children}
      </Pressable>
    );
  }

  return (
    // The compact capsule is shorter than a finger, so the slop puts the touch
    // target back at 44 without the glass having to be that tall.
    <Pressable
      onPress={onPress}
      hitSlop={compact ? COMPACT_SLOP : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <GlassView style={[styles.glassTextButton, compact && styles.glassTextCompact]} isInteractive>
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
export function GlassIconButtonGroup({ children, joined = false }: { children: ReactNode; joined?: boolean }) {
  if (!LIQUID_GLASS) return <View style={styles.flatGroup}>{children}</View>;

  if (joined) {
    return (
      <GlassView style={styles.joinedGroup} isInteractive>
        <JoinedGlassGroupContext.Provider value>{children}</JoinedGlassGroupContext.Provider>
      </GlassView>
    );
  }

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
  tintedFallback: {
    width: SIZE,
    height: SIZE,
    padding: 0,
    margin: 0,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GROUP_GAP,
  },
  joinedGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: SIZE / 2,
  },
  joinedButton: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassTextCompact: {
    height: COMPACT_SIZE,
    borderRadius: COMPACT_SIZE / 2,
  },
  flatTextMenuCompact: {
    minHeight: COMPACT_SIZE,
  },
  glassTextButton: {
    minWidth: 68,
    height: SIZE,
    paddingHorizontal: 12,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flatTextButton: {
    minWidth: 68,
    alignItems: 'center',
  },
  flatTextMenuLabel: {
    minWidth: 68,
    minHeight: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  menuLabel: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flatGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  disabled: {
    opacity: 0.45,
  },
});

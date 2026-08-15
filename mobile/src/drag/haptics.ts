import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Drag haptics, guarded so web (no haptic engine) and any rejected promise on a
 * device with haptics disabled are silent no-ops rather than console noise.
 */

/** A task has been picked up — the deliberate grab that starts the drag. */
export function hapticPickup(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** The ghost has moved over a fresh drop target — a lighter tick than the pickup. */
export function hapticTargetChange(): void {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * The app's haptic vocabulary, guarded so web (no haptic engine) and any
 * rejected promise on a device with haptics disabled are silent no-ops rather
 * than console noise.
 *
 * Kept to four, because a phone that buzzes at everything says nothing. These
 * fire when something is *committed* — a task completed, a row snoozed, a
 * selection changed — never on a press that merely opens something the screen
 * is about to show you anyway.
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

/**
 * An action landed: a task completed, a row snoozed from its swipe, a list
 * pulled far enough to refresh.
 *
 * Light rather than the success notification pattern, which is a double tap
 * meant for the end of something long. Completing a task is the most repeated
 * action in the app, and at twenty a day anything heavier turns into nagging.
 */
export function hapticAction(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A row joined or left the selection — the tick UIKit gives any picker. */
export function hapticSelect(): void {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

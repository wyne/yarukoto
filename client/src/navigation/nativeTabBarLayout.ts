import { Platform } from 'react-native';

export const ANDROID_TAB_BAR_HEIGHT = 64;
export const IOS_NATIVE_TAB_BAR_HEIGHT = 72;
export const ANDROID_FLOATING_CONTROL_GAP = 12;

/** Bottom edge for controls that sit above the system tab bar, such as the task FAB. */
export function nativeTabBarClearance(safeAreaBottom: number): number {
  return safeAreaBottom + (Platform.OS === 'android' ? ANDROID_TAB_BAR_HEIGHT : IOS_NATIVE_TAB_BAR_HEIGHT);
}

/** Bottom offset for floating controls inside the current screen's visible frame. */
export function nativeFloatingControlBottom(safeAreaBottom: number): number {
  return Platform.OS === 'android' ? ANDROID_FLOATING_CONTROL_GAP : nativeTabBarClearance(safeAreaBottom);
}

/** Leaves the final task fully scrollable above the translucent system bar. */
export const NATIVE_TAB_CONTENT_PADDING = 120;

/**
 * How far past `nativeTabBarClearance` a scroller has to carry its content for
 * the last row to come out from under the task FAB: the button's own height,
 * plus room to read the row once it has.
 *
 * The two compose. A scroller running to the screen edge needs both — the
 * clearance to get out from under the tab bar and this to get past the button
 * standing on it. One already held off the bottom by the clearance needs only
 * this. Neither stops anything scrolling *beneath* the FAB; they decide where
 * the content is allowed to come to rest.
 */
export const NATIVE_FAB_CLEARANCE = 56 + 16;

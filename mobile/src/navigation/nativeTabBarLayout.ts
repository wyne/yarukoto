/** Bottom edge for controls that sit above the system tab bar, such as the task FAB. */
export function nativeTabBarClearance(safeAreaBottom: number): number {
  return safeAreaBottom + 72;
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

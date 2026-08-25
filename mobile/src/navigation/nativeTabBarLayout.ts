/** Bottom edge for controls that sit above the system tab bar, such as the task FAB. */
export function nativeTabBarClearance(safeAreaBottom: number): number {
  return safeAreaBottom + 72;
}

/** Leaves the final task fully scrollable above the translucent system bar. */
export const NATIVE_TAB_CONTENT_PADDING = 120;

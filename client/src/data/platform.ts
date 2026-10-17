import { Platform } from 'react-native';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

declare global {
  interface Window {
    /** Set by windows/src/init.js before the exported web client starts. */
    __YARUKOTO_WINDOWS_APP__?: boolean;
  }
}

/**
 * The Mac build: the iOS app compiled for Mac Catalyst.
 *
 * `Platform.OS` is 'ios' there, so anything keyed on the platform alone treats
 * a desktop with a keyboard and trackpad as a phone. Questions about input go
 * through the capability checks below, never this. It is exported for the other
 * kind of question — a native control that renders differently on the Mac, as
 * SwiftUI's menus do.
 */
export const MAC = Platform.OS === 'ios' && Platform.isMacCatalyst === true;

/** The web export hosted by the Windows Tauri shell, rather than a browser. */
export const WINDOWS_APP =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.__YARUKOTO_WINDOWS_APP__ === true;

/** A directly distributed desktop binary, which owns its update experience. */
export const DESKTOP_APP = MAC || WINDOWS_APP;

/**
 * The desktop interaction model: a keyboard and a pointer are assumed present.
 *
 * Task entry types into a pinned field instead of tapping a floating button;
 * lists select with a click and extend with shift; menus open as popovers
 * beside what they act on instead of sheets from the bottom; panes resize.
 *
 * Decided by what the device is, not by screen width. The difference that
 * matters is having a keyboard already in front of you, not how many pixels
 * there are — a wide phone-in-landscape shouldn't get this, and a narrow
 * browser window shouldn't get the FAB. Every web build is assumed to have
 * one, which is the one guess in here; the Mac always does.
 *
 * Not the same as "the DOM exists". Code that touches `document` or `window`
 * checks `Platform.OS === 'web'` for itself, because the Mac is desktop and
 * has neither.
 */
export const DESKTOP_UI = Platform.OS === 'web' || MAC;

/**
 * Whether the narrow layout's tab bar floats over the content.
 *
 * Native tabs are system chrome drawn on top of the screen, so scrolling
 * content and anything pinned to the bottom have to clear them. The web tab bar
 * is a row of the layout that the content already ends above. A question about
 * chrome, not input: the Mac is desktop, and its tabs still float.
 */
export const FLOATING_TAB_BAR = Platform.OS !== 'web';

/**
 * A mouse or trackpad rather than a touchscreen.
 *
 * It decides how a drag is claimed. With a fine pointer, scrolling is a wheel
 * gesture, so pressing a row and moving can only mean dragging it and the drag
 * can start at once. On a touchscreen that same gesture is how you scroll, so a
 * drag has to be claimed deliberately with a hold first — and with the hold
 * spoken for, a touchscreen's menus come from it too, where a pointer's come
 * from right-click.
 *
 * Read once: a pointer being swapped mid-session is rare enough not to be worth
 * re-rendering every draggable row over. That also means an iPad with a
 * trackpad reads as touch, which is the safe side: holds still work there.
 */
export const FINE_POINTER =
  MAC ||
  (Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches);

/**
 * Whether this build can draw Liquid Glass.
 *
 * False everywhere but an iOS 26 device running a binary compiled against the
 * iOS 26 SDK — so web, Android and older iOS all take a flat fallback. The
 * second check is for the iOS 26 betas that ship the design without the API
 * behind it, where touching `UIGlassEffect` crashes.
 *
 * Read once: neither answer can change while the app is running.
 */
export const LIQUID_GLASS = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

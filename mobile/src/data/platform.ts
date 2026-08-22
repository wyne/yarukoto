import { Platform } from 'react-native';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * Task entry is split by platform, not by screen width: web types into a
 * pinned field; native taps a floating button that opens the composer sheet.
 * The difference that matters is having a keyboard already in front of you,
 * not how many pixels are — a wide phone-in-landscape shouldn't get the web
 * treatment, and a narrow browser window shouldn't get the FAB.
 */
export const WEB_ENTRY = Platform.OS === 'web';

/**
 * A mouse or trackpad rather than a touchscreen.
 *
 * It decides how a drag is claimed. With a fine pointer, scrolling is a wheel
 * gesture, so pressing a row and moving can only mean dragging it and the drag
 * can start at once. On a touchscreen that same gesture is how you scroll, so a
 * drag has to be claimed deliberately with a hold first.
 *
 * Read once: a pointer being swapped mid-session is rare enough not to be worth
 * re-rendering every draggable row over.
 */
export const FINE_POINTER =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

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

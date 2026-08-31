import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Clearance beyond the home indicator. A bottom-anchored surface draws square
 * corners into the display's rounded ones, so the last row of content is cut by
 * the screen's curve — at the horizontal edges especially — well before it
 * reaches the safe-area line. The inset alone is not enough to sit clear of it.
 */
const CORNER_CLEARANCE = 10;

/** Floor for devices that report no bottom inset at all. */
const MIN_BOTTOM_PADDING = 24;

/** Enough to part content from the keyboard without opening a gap under it. */
const KEYBOARD_BOTTOM_PADDING = 12;

/** Whether the software keyboard is currently on screen. */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // The 'will' events where they exist, so the padding changes in step with
    // the keyboard's own animation instead of snapping once it has landed.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setShown(true));
    const hide = Keyboard.addListener(hideEvent, () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return shown;
}

/**
 * Bottom padding for a surface that reaches the bottom edge of the screen — a
 * bottom sheet, or a form-sheet screen.
 *
 * `keyboard` marks a surface that rides above the keyboard. That only collapses
 * the padding while the keyboard is actually up: it is then covering the home
 * indicator and the screen corners, so the inset buys nothing and would just
 * leave a gap between the content and the keys. A sheet declared `keyboard`
 * still spends most of its life with its field unfocused — the reminder sheet
 * opens that way — and there it needs the full clearance like any other.
 */
export function useSheetBottomPadding(keyboard?: boolean): number {
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardShown();

  if (keyboard && keyboardShown) return KEYBOARD_BOTTOM_PADDING;
  return Math.max(MIN_BOTTOM_PADDING, insets.bottom + CORNER_CLEARANCE);
}

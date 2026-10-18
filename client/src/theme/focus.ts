import { useState } from 'react';
import type { ViewStyle } from 'react-native';
import { alpha } from './colors';
import { useAccent } from './ThemeContext';

/**
 * The app's own focus state for a text field, drawn on the frame the field sits in.
 *
 * Browsers ring a focused input with their own outline, which here landed *inside*
 * every styled field as a second, brighter box. public/index.html turns that outline
 * off for text fields, so each field that has a visible frame says it has the keyboard
 * by tinting that frame instead: the same signal, in the app's accent, at the edge
 * the eye already reads as the field's. Fields with no frame of their own (a task's
 * title, its notes) are edited in place and show only the caret, as in Notes.
 *
 * Spread `focusProps` onto the TextInput and layer `focusStyle` onto the frame — the
 * input itself when it draws the border, or the View around it when that does.
 */
export function useFieldFocus() {
  const accent = useAccent();
  const [focused, setFocused] = useState(false);
  return {
    focused,
    focusProps: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
    focusStyle: (focused ? { borderColor: alpha(accent, 0.55) } : null) as ViewStyle | null,
  };
}

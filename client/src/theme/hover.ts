import type { PressableStateCallbackType, StyleProp, ViewStyle } from 'react-native';
import { useColors } from './ThemeContext';

/**
 * react-native-web reports hover in the Pressable state callback; React Native's
 * types stop at `pressed`, since no native platform has a pointer to hover with.
 */
type PressState = PressableStateCallbackType & { hovered?: boolean };

/**
 * Style callback that layers `hover` on while a pointer rests on the element.
 *
 * Inert on native — nothing there sets `hovered` — and inert for touch on the
 * web too, because react-native-web's hover detection ignores touch pointers
 * rather than leaving a tapped row stuck in a highlighted state.
 */
export function hoverable(base: StyleProp<ViewStyle>, hover: StyleProp<ViewStyle>) {
  return (state: PressableStateCallbackType): StyleProp<ViewStyle> => [
    base,
    (state as PressState).hovered ? hover : null,
  ];
}

/**
 * The common case: tint a row, menu item or chip while the pointer rests on it.
 *
 * `suppressed` is for surfaces that already carry a stronger state — a selected
 * row, an active chip — where a hover tint would only muddy what it is saying.
 *
 * A hook returning the function, rather than the function itself, because the
 * tint has to come from the live palette and this is called from inside
 * `style={…}` expressions — sometimes within a `.map()` — where a hook cannot
 * go. Taking it once at the top of the component and calling it as before keeps
 * all 43 call sites the same shape.
 */
export function useHoverBg() {
  const colors = useColors();
  return (base: StyleProp<ViewStyle>, suppressed = false) =>
    hoverable(base, suppressed ? null : { backgroundColor: colors.hoverBg });
}

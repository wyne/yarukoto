import type { PressableStateCallbackType, StyleProp, ViewStyle } from 'react-native';

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

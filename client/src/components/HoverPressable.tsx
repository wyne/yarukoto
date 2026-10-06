import { Ref, useState } from 'react';
import {
  Platform,
  Pressable as RNPressable,
  PressableProps,
  PressableStateCallbackType,
  PointerEvent,
  View,
} from 'react-native';
import { FINE_POINTER } from '../data/platform';

// React 19 passes `ref` as an ordinary prop, so forwarding it is just passing it on.
type Props = PressableProps & { ref?: Ref<View> };

/**
 * Pressable, with `hovered` in its state on the Mac as well as on the web.
 *
 * The hover styling in theme/hover.ts reads `hovered` out of the state callback,
 * which react-native-web fills in and React Native doesn't. Native Pressable's
 * own `onHoverIn` doesn't help: on iOS it listens for mouse events UIKit never
 * sends, unless a React Native feature flag is flipped that we don't control.
 * What iOS does emit, from a mouse or trackpad, are W3C pointer events — so on
 * the Mac this tracks pointer enter and leave itself and hands the result to
 * the same callbacks, which then need no change at all.
 *
 * Everywhere else it is plain Pressable: web already has `hovered`, and a
 * touchscreen has nothing to hover with.
 */
export default function Pressable(props: Props) {
  if (Platform.OS === 'web' || !FINE_POINTER) return <RNPressable {...props} />;
  return <PointerHoverPressable {...props} />;
}

function PointerHoverPressable({ style, children, onPointerEnter, onPointerLeave, ...rest }: Props) {
  const [hovered, setHovered] = useState(false);
  const withHover = (state: PressableStateCallbackType) => ({ ...state, hovered });

  return (
    <RNPressable
      {...rest}
      onPointerEnter={(e: PointerEvent) => {
        setHovered(true);
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e: PointerEvent) => {
        setHovered(false);
        onPointerLeave?.(e);
      }}
      style={typeof style === 'function' ? (state) => style(withHover(state)) : style}
    >
      {typeof children === 'function' ? (state) => children(withHover(state)) : children}
    </RNPressable>
  );
}

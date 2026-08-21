import React, { useEffect, useRef } from 'react';
import { Platform, View, ViewProps } from 'react-native';

interface Props extends ViewProps {
  /** Called with the pointer position, in window coordinates. */
  onOpen: (at: { x: number; y: number }) => void;
  children: React.ReactNode;
}

/**
 * Gives its children a right-click menu on web.
 *
 * React Native has no context-menu gesture and react-native-web drops unknown
 * DOM props, so the listener is attached to the host node directly. Native
 * builds render a plain View and rely on long-press instead.
 */
export default function ContextMenuTarget({ onOpen, children, ...rest }: Props) {
  const ref = useRef<View>(null);
  // Held in a ref so the listener isn't torn down and rebuilt on every render
  // just because the handler closed over fresh props.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      onOpenRef.current({ x: e.clientX, y: e.clientY });
    };
    node.addEventListener('contextmenu', handler);
    return () => node.removeEventListener('contextmenu', handler);
  }, []);

  return (
    <View ref={ref} {...rest}>
      {children}
    </View>
  );
}

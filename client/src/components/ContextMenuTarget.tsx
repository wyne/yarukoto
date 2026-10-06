import React, { useEffect, useRef } from 'react';
import { Platform, View, ViewProps } from 'react-native';
import SecondaryClickView from '../../modules/mac-pointer/src/SecondaryClickView';
import { MAC } from '../data/platform';

interface Props extends ViewProps {
  /** Called with the pointer position, in window coordinates. */
  onOpen: (at: { x: number; y: number }) => void;
  children: React.ReactNode;
}

/**
 * Gives its children a right-click menu wherever there is a right button.
 *
 * Web and iOS reach it differently. React Native has no context-menu gesture
 * and react-native-web drops unknown DOM props, so on web the `contextmenu`
 * listener is attached to the host node directly — which also catches the
 * keyboard's menu key and a ctrl-click. On iOS a right-click never reaches
 * React Native at all (its recognizers accept the primary button only), so the
 * children sit in a native view that catches it and reports where it landed.
 * That view only listens on the Mac (see SecondaryClickView.swift for why an
 * iPad keeps its long-press alone), so it is only mounted there. A phone, an
 * iPad and Android have no right button worth wiring and get the children as
 * they are.
 *
 * Right-click needs no capability check: it is purely additive. A device
 * without the button never sends it, and one with it gains a menu without
 * losing anything.
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

  // Only the Mac has a right button to listen for. Everywhere else native, the
  // wrapper would be one more view per task row for nothing, so the children
  // stand in for it unless the caller styled it.
  if (Platform.OS !== 'web' && !MAC) {
    return Object.keys(rest).length === 0 ? <>{children}</> : <View {...rest}>{children}</View>;
  }

  if (Platform.OS === 'ios') {
    return (
      <SecondaryClickView onSecondaryClick={(e) => onOpenRef.current(e.nativeEvent)} {...rest}>
        {children}
      </SecondaryClickView>
    );
  }

  return (
    <View ref={ref} {...rest}>
      {children}
    </View>
  );
}

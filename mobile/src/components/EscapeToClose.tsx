import React, { useEffect, useRef } from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import EscapeKeyView from '../../modules/mac-pointer/src/EscapeKeyView';
import { MAC } from '../data/platform';

interface Props {
  /** Only listens while true, so a hidden layer doesn't swallow the key. */
  active: boolean;
  onEscape: () => void;
  /**
   * The layer is a React Native Modal. On the web those already close on
   * Escape — the top one only — through `onRequestClose`, so listening here as
   * well would close the one beneath it on the same key press.
   */
  inModal?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Closes a desktop layer — a popover, a dialog — on Escape, the way every other
 * dismissible layer on a desktop closes.
 *
 * Wraps the layer rather than being a hook because the Mac has no `document` to
 * listen on: its key arrives through the responder chain, so the listener has to
 * be a view the focused field sits inside. See EscapeKeyView.swift. The web
 * listens on `document` where a Modal doesn't already, and a phone has no Escape
 * key, so there it is a plain view.
 */
export default function EscapeToClose({ active, onEscape, inModal, style, children }: Props) {
  // Held in a ref so the listener isn't rebuilt every time a caller passes a
  // fresh arrow function.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (Platform.OS !== 'web' || !active || inModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscapeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, inModal]);

  if (MAC) {
    return (
      <EscapeKeyView style={style} onEscape={() => active && onEscapeRef.current()}>
        {children}
      </EscapeKeyView>
    );
  }

  return (
    <View style={style} pointerEvents="box-none">
      {children}
    </View>
  );
}

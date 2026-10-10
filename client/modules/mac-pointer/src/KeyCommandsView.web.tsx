import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { domKeyName } from '../../../src/navigation/commands';
import type { KeyCommandsViewProps } from './KeyCommandsView';

/**
 * The web's KeyCommandsView: the same keys, heard on the way down.
 *
 * react-native-web's text fields stop every keydown from bubbling, so a key
 * typed in a field inside never reaches a listener above it. Listening in the
 * capture phase on this view's own node hears it first, as the Mac's key
 * commands do, and only while focus is somewhere inside.
 *
 * Only the wrapper half: `focusable` means nothing here, since the web's list
 * hears its keys on `document` (MenuCommands). An `onKeyCommand` that returns
 * false leaves the key to the browser — Tab on a button keeps moving between
 * buttons, say.
 */
export default function KeyCommandsView({
  keys,
  active = true,
  onKeyCommand,
  focusable: _focusable,
  focusKey: _focusKey,
  onFocusChange: _onFocusChange,
  ...rest
}: KeyCommandsViewProps) {
  const node = useRef<HTMLElement | null>(null);
  const latest = useRef({ keys, active, onKeyCommand });
  latest.current = { keys, active, onKeyCommand };

  useEffect(() => {
    const el = node.current;
    if (!el?.addEventListener) return;
    const onKey = (e: KeyboardEvent) => {
      const { keys, active, onKeyCommand } = latest.current;
      if (!active || e.isComposing || e.defaultPrevented) return;
      const name = domKeyName(e);
      if (!keys.includes(name)) return;
      let handled: boolean | void = true;
      try {
        handled = (onKeyCommand as (event: unknown) => boolean | void)({ nativeEvent: { key: name } });
      } finally {
        // Taken even if the handler threw part-way: by then it may have moved
        // focus, and the browser's own Tab would move it again from there.
        if (handled !== false) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    el.addEventListener('keydown', onKey, true);
    return () => el.removeEventListener('keydown', onKey, true);
  }, []);

  return <View ref={node as never} {...rest} />;
}

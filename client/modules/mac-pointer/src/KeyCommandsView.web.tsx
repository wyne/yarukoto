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
 * `focusable` makes the view itself a tab stop that takes focus when
 * `focusKey` changes, as the sidebar does; the task list doesn't use it here,
 * since the web's list hears its keys on `document` (MenuCommands). An
 * `onKeyCommand` that returns false leaves the key to the browser — Tab on a
 * button keeps moving between buttons, say.
 */
export default function KeyCommandsView({
  keys,
  active = true,
  onKeyCommand,
  focusable = false,
  focusKey = 0,
  onFocusChange,
  style,
  ...rest
}: KeyCommandsViewProps) {
  const node = useRef<HTMLElement | null>(null);
  const latest = useRef({ keys, active, onKeyCommand, onFocusChange });
  latest.current = { keys, active, onKeyCommand, onFocusChange };

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
    // Whether the view itself has focus, as the Mac reports first responder.
    const report = (focused: boolean) => () =>
      latest.current.onFocusChange?.({ nativeEvent: { focused } } as never);
    const onIn = (e: FocusEvent) => e.target === el && report(true)();
    const onOut = (e: FocusEvent) => e.target === el && report(false)();
    el.addEventListener('keydown', onKey, true);
    el.addEventListener('focusin', onIn);
    el.addEventListener('focusout', onOut);
    return () => {
      el.removeEventListener('keydown', onKey, true);
      el.removeEventListener('focusin', onIn);
      el.removeEventListener('focusout', onOut);
    };
  }, []);

  useEffect(() => {
    if (focusable && focusKey > 0 && active) node.current?.focus?.();
  }, [focusable, focusKey, active]);

  return (
    <View
      ref={node as never}
      focusable={focusable}
      // The view's own focus is shown by what it draws, not a browser outline.
      style={focusable ? [style, { outlineWidth: 0 } as never] : style}
      {...rest}
    />
  );
}

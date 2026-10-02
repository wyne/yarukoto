import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import KeyCommandsView from '../../modules/mac-pointer/src/KeyCommandsView';
import { MAC } from '../data/platform';
import { LIST_KEYS } from '../navigation/commands';
import { dispatchCommand } from '../navigation/MenuCommands';
import { useAllLayersClosed } from './openLayers';

const KEY_NAMES = [...LIST_KEYS.keys()];

interface Props {
  /** Bumped by the screen when a click lands in the list, so the list takes the keyboard. */
  focusKey: number;
  children: React.ReactNode;
}

/**
 * The task list's plain keys on the Mac — ↑, ↓, ⇧↑, ⇧↓, Return, Escape — by
 * the command each runs (`listKeys` in commands.ts).
 *
 * The list takes the keyboard when it appears, when its screen comes to the
 * front, when a click lands in it, and when the last dialog or popover closes.
 * A field focused anywhere else keeps its keys, since the list isn't in its
 * responder chain; see KeyCommandsView.swift.
 *
 * Only the Mac: the web hears the same keys on `document` (MenuCommands), and a
 * phone has no keys to hear.
 */
export default function ListKeys({ focusKey, children }: Props) {
  const focused = useIsFocused();
  const [reclaim, setReclaim] = useState(0);
  useAllLayersClosed(() => setReclaim((n) => n + 1));
  // Back to the front: take the keyboard back from whatever had it.
  useEffect(() => {
    if (focused) setReclaim((n) => n + 1);
  }, [focused]);

  if (!MAC) return <>{children}</>;
  return (
    <KeyCommandsView
      style={styles.fill}
      keys={KEY_NAMES}
      active={focused}
      focusable
      focusKey={focusKey + reclaim}
      onKeyCommand={({ nativeEvent }) => {
        const id = LIST_KEYS.get(nativeEvent.key);
        if (id) dispatchCommand(id);
      }}
    >
      {children}
    </KeyCommandsView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { MAC, MAC_KEYS } from '../data/platform';
import { CommandId, commandDef, formatShortcut } from '../navigation/commands';
import { useAvailableCommands } from '../navigation/MenuCommands';
import { useShortcutHintsShown } from '../navigation/shortcutHints';

interface Props {
  command: CommandId;
  /**
   * Where the label sits, over the control it names. By default against the
   * right edge, centred, which suits a row; an icon button wants it below.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * A command's key, drawn over the control that does the same thing while ⌘ is
 * held (see shortcutHints.ts). Laid over rather than beside, so nothing moves
 * as the hints come and go.
 *
 * Shows only a key that works here and now: one the web leaves to the browser,
 * or one nothing on screen answers, is no hint at all.
 */
export default function ShortcutHint({ command, style }: Props) {
  const styles = useStyles();
  const shown = useShortcutHintsShown();
  const available = useAvailableCommands();
  if (!shown || !available.has(command)) return null;
  const { shortcut, web } = commandDef(command);
  if (!shortcut || !(MAC || web)) return null;
  return (
    <View pointerEvents="none" style={[styles.place, style]}>
      <View style={styles.badge}>
        <Text style={styles.keys} numberOfLines={1}>{formatShortcut(shortcut, MAC_KEYS)}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  // Wider than any label. An absolute view sized by its content is held to its
  // parent's width by Yoga, so on the Mac a hint over an 18pt chevron was
  // squeezed to 18pt; a fixed box lets the badge be as wide as its keys.
  place: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 8,
    width: 160,
    justifyContent: 'center',
    alignItems: 'flex-end',
    zIndex: 10,
  },
  badge: {
    flexShrink: 0,
    backgroundColor: c.inverseSurface,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  keys: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 0.5,
    color: c.inverseText,
  },
}));

/** For an icon button: centred on it, rather than against a row's right edge. */
export const HINT_OVER_ICON: ViewStyle = {
  top: 0,
  bottom: 0,
  left: -40,
  right: -40,
  width: 'auto',
  alignItems: 'center',
};

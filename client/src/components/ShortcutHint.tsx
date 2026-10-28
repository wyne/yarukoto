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
   * The command modifier is already down while a hint is visible. Icon rails
   * can therefore show only the remaining key, keeping the icon underneath
   * legible in their much smaller target.
   */
  compact?: boolean;
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
export default function ShortcutHint({ command, compact = false, style }: Props) {
  const styles = useStyles();
  const shown = useShortcutHintsShown();
  const available = useAvailableCommands();
  if (!shown || !available.has(command)) return null;
  const { shortcut, web } = commandDef(command);
  if (!shortcut || !(MAC || web)) return null;
  const displayedShortcut = compact
    ? { ...shortcut, modifiers: shortcut.modifiers.filter((modifier) => modifier !== 'command') }
    : shortcut;
  return (
    <View pointerEvents="none" style={[styles.place, style]}>
      <View style={[styles.badge, compact && styles.compactBadge]}>
        <Text style={[styles.keys, compact && styles.compactKeys]} numberOfLines={1}>
          {formatShortcut(displayedShortcut, MAC_KEYS)}
        </Text>
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
  compactBadge: {
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  keys: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 0.5,
    color: c.inverseText,
  },
  compactKeys: {
    fontSize: 10,
    letterSpacing: 0,
  },
}));

/** For an icon rail: a small lower-right badge that leaves the icon visible. */
export const HINT_ON_ICON_CORNER: ViewStyle = {
  top: 17,
  bottom: undefined,
  right: 1,
  width: 18,
  justifyContent: 'flex-start',
  alignItems: 'center',
};

import React from 'react';
import { View } from 'react-native';
import Pressable from '../HoverPressable';
import { ACCENT_OPTIONS, SchemePref } from '../../theme/colors';
import { makeStyles } from '../../theme/styles';
import { useColors, useTheme } from '../../theme/ThemeContext';
import { LINKS, openLink } from '../../data/links';
import { Group, Row, Segmented } from './parts';

const SCHEME_OPTIONS: Array<{ value: SchemePref; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** In the order someone needing them would look: how it works, then who to ask. */
const HELP_LINKS: Array<{ label: string; url: string }> = [
  { label: 'Setting up a server', url: LINKS.setupGuide },
  { label: 'Using the apps', url: LINKS.appGuide },
  { label: 'Get help', url: LINKS.support },
  { label: 'Privacy policy', url: LINKS.privacy },
];

/** How this device draws the app. Stored here only, never synced. */
export function AppearanceGroup({ label }: { label?: string }) {
  const styles = useStyles();
  const colors = useColors();
  const { accent, setAccent, schemePref, setSchemePref } = useTheme();
  return (
    <Group label={label}>
      <Row
        title="Theme"
        trailing={
          <Segmented options={SCHEME_OPTIONS} value={schemePref} onChange={setSchemePref} style={styles.scheme} />
        }
      />
      <Row
        divided
        title="Accent"
        trailing={
          <View style={styles.accentRow}>
            {ACCENT_OPTIONS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setAccent(option)}
                style={[styles.swatchRing, option === accent && { borderColor: colors.textPrimary }]}
                accessibilityLabel={`Accent colour ${option}`}
                accessibilityState={{ selected: option === accent }}
              >
                <View style={[styles.swatch, { backgroundColor: option }]} />
              </Pressable>
            ))}
          </View>
        }
      />
    </Group>
  );
}

export function HelpGroup() {
  return (
    <Group label="Help">
      {HELP_LINKS.map((link, i) => (
        <Row
          key={link.url}
          divided={i > 0}
          title={link.label}
          value="↗"
          onPress={() => openLink(link.url)}
          accessibilityRole="link"
        />
      ))}
    </Group>
  );
}

const useStyles = makeStyles(() => ({
  scheme: {
    width: 196,
  },
  accentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  /** The ring, not the swatch, carries the selection — the fill stays true to the colour. */
  swatchRing: {
    padding: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 999,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 999,
  },
}));

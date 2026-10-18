import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Switch, View } from 'react-native';
import MacStatusItem, { LoginItemStatus } from '../../../modules/mac-status-item/src/MacStatusItem';
import Pressable from '../HoverPressable';
import { ACCENT_OPTIONS, SchemePref } from '../../theme/colors';
import { makeStyles } from '../../theme/styles';
import { useColors, useTheme } from '../../theme/ThemeContext';
import { LINKS, openLink } from '../../data/links';
import { MAC } from '../../data/platform';
import { Group, Note, Row, Segmented } from './parts';

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

const LOGIN_NOTES: Partial<Record<LoginItemStatus, string>> = {
  requiresApproval: 'macOS is waiting for you to allow Yarukoto in Login Items.',
  unavailable: "This Mac can't open Yarukoto at login.",
};

/**
 * The Mac's menu bar extra and login item. Native state rather than a synced or
 * stored preference: the menu bar setting is read at launch, before JS, and
 * whether Yarukoto opens at login is the system's to say, since it can be
 * changed in System Settings too. Hence the re-read whenever the app comes back.
 */
export function MacAppGroup() {
  const available = MAC && !!MacStatusItem?.isAvailable();
  const [menuBar, setMenuBar] = useState(() => (available ? MacStatusItem!.isMenuBarEnabled() : false));
  const [login, setLogin] = useState<LoginItemStatus>('unavailable');
  const [loginError, setLoginError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!available) return;
    MacStatusItem!.getLoginItemStatus().then(setLogin, () => setLogin('unavailable'));
  }, [available]);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  if (!available) return null;

  const toggleMenuBar = (enabled: boolean) => {
    setMenuBar(enabled);
    MacStatusItem!.setMenuBarEnabled(enabled);
  };

  const toggleLogin = (enabled: boolean) => {
    setLoginError(null);
    MacStatusItem!.setOpensAtLogin(enabled).then(setLogin, (error: Error) => {
      setLoginError(error.message);
      refresh();
    });
  };

  return (
    <>
      <Group
        label="Mac"
        note={
          menuBar
            ? "Closing the window keeps Yarukoto running in the menu bar, with today's tasks a click away. Quit it from there."
            : undefined
        }
      >
        <Row
          title="Show in menu bar"
          trailing={<Switch value={menuBar} onValueChange={toggleMenuBar} accessibilityLabel="Show in menu bar" />}
        />
        <Row
          divided
          title="Open at login"
          subtitle={menuBar ? 'Starts in the menu bar, without a window.' : null}
          trailing={
            <Switch
              value={login === 'enabled' || login === 'requiresApproval'}
              disabled={login === 'unavailable'}
              onValueChange={toggleLogin}
              accessibilityLabel="Open at login"
            />
          }
        />
        {login === 'requiresApproval' && (
          <Row divided title="Open Login Items…" tone="action" onPress={() => MacStatusItem!.openLoginItemsSettings()} />
        )}
      </Group>
      {(loginError ?? LOGIN_NOTES[login]) && <Note tone="error">{loginError ?? LOGIN_NOTES[login]}</Note>}
    </>
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

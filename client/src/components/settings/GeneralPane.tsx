import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Switch, Text, View } from 'react-native';
import MacStatusItem, { LoginItemStatus } from '../../../modules/mac-status-item/src/MacStatusItem';
import Pressable from '../HoverPressable';
import { ACCENT_OPTIONS, SchemePref } from '../../theme/colors';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useColors, useTheme } from '../../theme/ThemeContext';
import { LINKS, openLink } from '../../data/links';
import { APP_VERSION, checkForAppUpdatesInteractively } from '../../data/appUpdates';
import { DESKTOP_APP, MAC, WINDOWS_APP } from '../../data/platform';
import { setOpenAtLogin, setShowInTray, traySettings, TraySettings } from '../../data/windowsTray';
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

/**
 * The Windows app's notification area icon and login item, the counterpart of
 * `MacAppGroup`. Native state for the same reasons: the shell reads the icon
 * setting before the page loads, and the login item can be turned off from
 * Task Manager's Startup apps too, hence the re-read when the app comes back.
 */
export function WindowsAppGroup() {
  const [settings, setSettings] = useState<TraySettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!WINDOWS_APP) return;
    traySettings().then(setSettings, () => setSettings(null));
  }, []);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  if (!WINDOWS_APP || !settings) return null;

  const toggleTray = (enabled: boolean) => {
    setError(null);
    setSettings({ ...settings, showInTray: enabled });
    setShowInTray(enabled).catch((e: unknown) => {
      setError(String(e));
      refresh();
    });
  };

  const toggleLogin = (enabled: boolean) => {
    setError(null);
    setOpenAtLogin(enabled).then(
      (openAtLogin) => setSettings((current) => current && { ...current, openAtLogin }),
      (e: unknown) => {
        setError(String(e));
        refresh();
      }
    );
  };

  return (
    <>
      <Group
        label="Windows"
        note={
          settings.showInTray
            ? "Closing the window keeps Yarukoto running in the notification area, with today's tasks a right-click away. Exit it from there."
            : undefined
        }
      >
        <Row
          title="Show in notification area"
          trailing={
            <Switch
              value={settings.showInTray}
              onValueChange={toggleTray}
              accessibilityLabel="Show in notification area"
            />
          }
        />
        <Row
          divided
          title="Open at login"
          subtitle={settings.showInTray ? 'Starts in the notification area, without a window.' : null}
          trailing={
            <Switch
              value={settings.openAtLogin === true}
              disabled={settings.openAtLogin === null}
              onValueChange={toggleLogin}
              accessibilityLabel="Open at login"
            />
          }
        />
      </Group>
      {error && <Note tone="error">{error}</Note>}
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

/** Version and an explicit update check, only in directly distributed builds. */
export function UpdatesGroup() {
  const [checking, setChecking] = useState(false);
  if (!DESKTOP_APP) return null;

  const check = () => {
    setChecking(true);
    void checkForAppUpdatesInteractively().finally(() => setChecking(false));
  };

  return (
    <Group label="Updates">
      <Row title="Client version" value={APP_VERSION ? `v${APP_VERSION}` : 'Unknown'} mono />
      <Row divided title="Check for updates…" tone="action" onPress={check} busy={checking} />
    </Group>
  );
}

/**
 * The app's version, as a quiet line at the foot of Settings, where the phone's
 * own apps and the web put it. Labelled "client" so it isn't read as the
 * server's, which the Server page shows. The desktop apps show it in Updates instead,
 * beside the check it answers, and the Mac in About Yarukoto too.
 */
export function VersionFooter() {
  const styles = useStyles();
  if (DESKTOP_APP || !APP_VERSION) return null;
  return (
    <Text style={styles.version} selectable accessibilityLabel={`Client version ${APP_VERSION}`}>
      Client v{APP_VERSION}
    </Text>
  );
}

const useStyles = makeStyles((c) => ({
  version: {
    paddingHorizontal: 4,
    textAlign: 'center',
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
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

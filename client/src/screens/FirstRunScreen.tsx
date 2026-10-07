import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors, useScheme } from '../theme/ThemeContext';
import { ApiError, useSyncStatus, useTasks } from '../data/TaskContext';
import { JoinLink, codeFromPairingLink, createApi, parseJoinLink } from '../data/api';
import { confirmAsync } from '../data/confirm';
import { claimJoinLink, useJoinLink, useSignIn } from '../navigation/joinLinks';
import { SavedServer, loadSavedServers } from '../data/storage';
import { IconLock, IconServer, IconShield } from '../icons/Icons';
import Sheet from '../components/Sheet';
import PairingPanel from '../components/household/PairingPanel';
import QrScanner, { CAN_SCAN } from '../components/household/QrScanner';

const LOGO = require('../../assets/logo.png');
const LOGO_DARK = require('../../assets/logo-dark.png');

/**
 * When the web build is served by its own API server (the normal docker-compose
 * deployment), the page's own origin already *is* the server — asking for a URL
 * is friction with no purpose. This resolves to that origin only if it actually
 * answers as a Yarukoto server; it stays null for the Expo dev server (a
 * different port than the API) and for native, where there's no origin at all.
 */
function useSameOriginServer(): string | null | undefined {
  const [origin, setOrigin] = useState<string | null | undefined>(Platform.OS === 'web' ? undefined : null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const candidate = window.location.origin;
    fetch(`${candidate}/api/v1/health`)
      // A dev server (e.g. Metro) can 200 an unmatched path with its index.html
      // SPA fallback, so res.ok alone isn't proof this origin is the API — the
      // body has to actually be the health payload.
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setOrigin(body && body.ok === true ? candidate : null))
      .catch(() => setOrigin(null));
  }, []);

  return origin;
}

export default function FirstRunScreen() {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const { state, signedOut, disconnect, useSampleData, removeSavedServer } = useTasks();
  const { pending } = useSyncStatus();
  const signIn = useSignIn();
  const sameOriginServer = useSameOriginServer();
  /** Signed out of a server this device is still connected to, rather than never signed in. */
  const signedOutOf = state.mode === 'server' && signedOut ? state.serverUrl : null;
  const [serverUrl, setServerUrl] = useState(signedOutOf ?? '');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [savedServers, setSavedServers] = useState<SavedServer[]>([]);
  /**
   * A code approved from a signed-in device is the everyday way in; the
   * server's own token is for the very first sign-in, when nobody is signed in
   * to approve anything, and for servers from before households.
   */
  const [method, setMethod] = useState<'code' | 'token'>('code');
  /** The server a code is being shown for, while the pairing panel is up. */
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  /** The server a scanned QR is signing in to, while that is under way. */
  const [joiningUrl, setJoiningUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const join = async (link: JoinLink) => {
    setError(null);
    setPairingUrl(null);
    setJoiningUrl(link.serverUrl);
    try {
      await signIn(link.serverUrl, await claimJoinLink(link));
    } catch (err) {
      setServerUrl(link.serverUrl);
      setError(err instanceof ApiError ? err.message : 'Something went wrong signing in.');
    } finally {
      setJoiningUrl(null);
    }
  };
  useJoinLink(join);

  const handleScan = (data: string): string | null => {
    const link = parseJoinLink(data);
    if (!link) {
      return codeFromPairingLink(data)
        ? 'That QR is for approving a new device. On the signed-in device, choose Show a QR to scan instead.'
        : 'That isn’t a Yarukoto sign-in QR.';
    }
    setScanning(false);
    join(link);
    return null;
  };

  const handleDisconnect = async () => {
    if (pending > 0) {
      const one = pending === 1;
      const ok = await confirmAsync(
        'Disconnect?',
        `${one ? '1 change on this device hasn’t' : `${pending} changes on this device haven’t`} synced and will be discarded.`,
        'Disconnect',
        true
      );
      if (!ok) return;
    }
    disconnect();
  };

  useEffect(() => {
    setSavedServers(loadSavedServers());
  }, []);

  // Still resolving whether this page is itself the server — hold off rendering
  // either form so it doesn't flash from simple to full a moment later.
  if (sameOriginServer === undefined) return null;

  const handleConnect = async (urlOverride?: string, tokenOverride?: string) => {
    const url = urlOverride ?? (sameOriginServer ?? serverUrl).trim();
    const tok = tokenOverride ?? token;
    if (!sameOriginServer && !urlOverride && !/^https?:\/\/.+/i.test(url)) {
      setError('Enter a full server URL, starting with http:// or https://');
      return;
    }
    setError(null);
    setConnecting(true);
    try {
      await signIn(url, tok);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? 'That token was rejected. Check it and try again.'
            : err.message
          : 'Something went wrong connecting.'
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleSignInWithCode = async () => {
    const url = (sameOriginServer ?? serverUrl).trim().replace(/\/+$/, '');
    if (!sameOriginServer && !/^https?:\/\/.+/i.test(url)) {
      setError('Enter a full server URL, starting with http:// or https://');
      return;
    }
    setError(null);
    setConnecting(true);
    const info = await createApi(url, '').health();
    setConnecting(false);
    if (!info) {
      setError('Could not reach the server.');
    } else if (!info.features.includes('household')) {
      setMethod('token');
      setError("This server doesn't support sign-in codes yet. Enter its access token instead.");
    } else {
      setPairingUrl(url);
    }
  };

  const handleApproved = async (tok: string) => {
    if (!pairingUrl) return;
    try {
      if (!(await signIn(pairingUrl, tok))) setPairingUrl(null);
    } catch (err) {
      setPairingUrl(null);
      setError(err instanceof ApiError ? err.message : 'Something went wrong signing in.');
    }
  };

  const handleForgetServer = (url: string) => {
    removeSavedServer(url);
    setSavedServers(loadSavedServers());
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.content, { paddingTop: insets.top + 24 }]}>
        <View style={{ flex: 1 }} />
        <Image source={scheme === 'dark' ? LOGO_DARK : LOGO} style={styles.logo} accessible={false} />
        <Text style={styles.appName}>{signedOutOf ? 'Signed out' : 'Yarukoto'}</Text>
        <Text style={styles.tagline}>
          {signedOutOf
            ? signedOut === 'signed_out'
              ? `This device was signed out of ${signedOutOf}. Sign in again to pick up where you left off.`
              : `${signedOutOf} no longer accepts this device's sign-in. Sign in again to pick up where you left off.`
            : sameOriginServer
              ? 'This page is served by your Yarukoto server. Sign in to get started.'
              : 'Your tasks, on your server. Point Yarukoto at your instance to get started.'}
        </Text>
        {signedOutOf && (
          <Text style={styles.scanHint}>
            {pending > 0
              ? `Your tasks are still on this device, including ${pending === 1 ? '1 change' : `${pending} changes`} waiting to sync.`
              : 'Your tasks are still on this device.'}
          </Text>
        )}
        {Platform.OS !== 'web' && !CAN_SCAN && (
          <Text style={styles.scanHint}>
            Already signed in somewhere else? Open Settings there, show a QR under Household, and scan it with this
            device's camera.
          </Text>
        )}
        {CAN_SCAN && !joiningUrl && !pairingUrl && (
          <>
            <Pressable style={[styles.connectBtn, styles.scanBtn]} onPress={() => setScanning(true)}>
              <Text style={styles.connectText}>Scan QR code</Text>
            </Pressable>
            <Text style={styles.scanHint}>
              Signed in on another device? Open Settings there, show a QR under Household, and scan it.
            </Text>
          </>
        )}

        {joiningUrl ? (
          <View style={styles.joining}>
            <ActivityIndicator color={accent} />
            <Text style={styles.joiningText} numberOfLines={2}>
              Signing in to {joiningUrl}…
            </Text>
          </View>
        ) : pairingUrl ? (
          <PairingPanel serverUrl={pairingUrl} onApproved={handleApproved} onCancel={() => setPairingUrl(null)} />
        ) : (
          <View style={styles.form}>
            {!sameOriginServer && (
              <View style={styles.field}>
                <IconServer />
                <TextInput
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  placeholder="https://your-server.example.com"
                  placeholderTextColor={colors.textFaint}
                  style={styles.fieldInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            )}
            {method === 'token' && (
              <View style={styles.field}>
                <IconLock />
                <TextInput
                  value={token}
                  onChangeText={setToken}
                  placeholder="Access token"
                  placeholderTextColor={colors.textFaint}
                  style={styles.fieldInput}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={styles.connectBtn}
              onPress={() => (method === 'code' ? handleSignInWithCode() : handleConnect())}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.connectText}>{method === 'code' ? 'Sign in with a code' : 'Connect'}</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setError(null);
                setMethod(method === 'code' ? 'token' : 'code');
              }}
              hitSlop={6}
            >
              <Text style={styles.methodSwitch}>
                {method === 'code' ? (
                  <>
                    Setting up, or an older server? <Text style={{ color: accent }}>Use an access token</Text>
                  </>
                ) : (
                  <Text style={{ color: accent }}>Sign in with a code instead</Text>
                )}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.trustRow}>
          <IconShield />
          <Text style={styles.trustText}>Your data never leaves your server.</Text>
        </View>

        {signedOutOf && (
          <Pressable onPress={handleDisconnect} hitSlop={6} style={styles.disconnect}>
            <Text style={styles.methodSwitch}>
              Or <Text style={{ color: accent }}>disconnect from this server</Text>
            </Text>
          </Pressable>
        )}

        {!signedOutOf && savedServers.length > 0 && (
          <>
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
            </View>
            <Text style={styles.savedLabel}>Saved servers</Text>
            {savedServers.map((s) => (
              <View key={s.url} style={styles.savedRow}>
                <Pressable style={styles.savedRowBtn} onPress={() => handleConnect(s.url, s.token)}>
                  <IconServer />
                  <Text style={styles.savedUrl} numberOfLines={1}>{s.url}</Text>
                </Pressable>
                <Pressable onPress={() => handleForgetServer(s.url)} hitSlop={8} style={styles.forgetBtn}>
                  <Text style={styles.forgetText}>×</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {!signedOutOf && (
          <>
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
            </View>

            <Pressable style={styles.sampleBtn} onPress={useSampleData}>
              <Text style={[styles.sampleText, { color: accent }]}>Explore with sample data</Text>
            </Pressable>
            <Text style={styles.sampleHint}>
              No server needed. Everything stays on this device and resets when you reload.
            </Text>
          </>
        )}

        <View style={{ flex: 1.4 }} />
        <Pressable onPress={() => setHelpOpen(true)} style={{ paddingBottom: Math.max(24, insets.bottom) }}>
          <Text style={styles.footer}>
            Need a server? <Text style={{ color: accent }}>Read the setup guide</Text>
          </Text>
        </Pressable>
      </View>

      {CAN_SCAN && (
        <QrScanner
          visible={scanning}
          onClose={() => setScanning(false)}
          title="Scan the sign-in QR"
          onScan={handleScan}
        />
      )}

      <Sheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="Self-hosting Yarukoto">
        <Text style={styles.helpText}>
          Yarukoto talks to a small self-hosted server that stores your tasks, lists and tags. Deploy the server
          anywhere you like, then enter its URL here. The first time, sign in with the server's access token;
          after that, each new device signs in with a code that someone already signed in approves. Nothing is
          sent anywhere else.
        </Text>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  screen: {
    flex: 1,
    backgroundColor: c.screenBg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  appName: {
    fontFamily: fonts.sansBold,
    fontSize: 28,
    color: c.textPrimary,
    marginTop: 18,
  },
  tagline: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textSecondary,
    marginTop: 6,
    lineHeight: 21,
  },
  form: {
    marginTop: 28,
    gap: 10,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  fieldInput: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 15,
    color: c.textPrimary,
    padding: 0,
  },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.priorityHigh,
  },
  connectBtn: {
    backgroundColor: c.inverseSurface,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  connectText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.inverseText,
  },
  scanHint: {
    marginTop: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 19,
    color: c.textTertiary,
  },
  scanBtn: {
    marginTop: 20,
  },
  disconnect: {
    marginTop: 14,
  },
  joining: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  joiningText: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textSecondary,
  },
  methodSwitch: {
    marginTop: 4,
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    fontSize: 13.5,
    color: c.textTertiary,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: c.border,
  },
  orText: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: c.textFaint,
  },
  sampleBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: c.surface,
  },
  sampleText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
  },
  sampleHint: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 17,
    color: c.textTertiary,
  },
  trustText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
    color: c.textSecondary,
  },
  savedLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: c.textFaint,
    marginTop: 14,
    marginBottom: 8,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    backgroundColor: c.surface,
  },
  savedRowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  savedUrl: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 14,
    color: c.textPrimary,
  },
  forgetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  forgetText: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
    color: c.textFaint,
  },
  footer: {
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textTertiary,
  },
  helpText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 21,
    color: c.textSecondary,
  },
}));

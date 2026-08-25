import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { ApiError, useTasks } from '../data/TaskContext';
import { SavedServer, loadSavedServers } from '../data/storage';
import { IconCheckBig, IconLock, IconServer, IconShield } from '../icons/Icons';
import BottomSheet from '../components/BottomSheet';

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
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { connect, useSampleData, removeSavedServer } = useTasks();
  const sameOriginServer = useSameOriginServer();
  const [serverUrl, setServerUrl] = useState('https://todo.selfhost.dev');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [savedServers, setSavedServers] = useState<SavedServer[]>([]);

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
      await connect(url, tok);
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
        <View style={styles.logo}>
          <IconCheckBig size={28} color={accent} strokeWidth={3} />
        </View>
        <Text style={styles.appName}>Yarukoto</Text>
        <Text style={styles.tagline}>
          {sameOriginServer
            ? 'This page is served by your Yarukoto server. Enter its access token to get started.'
            : 'Your tasks, on your server. Point Yarukoto at your instance to get started.'}
        </Text>

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
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.connectBtn} onPress={() => handleConnect()} disabled={connecting}>
            {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.connectText}>Connect</Text>}
          </Pressable>
        </View>

        <View style={styles.trustRow}>
          <IconShield />
          <Text style={styles.trustText}>Your data never leaves your server.</Text>
        </View>

        {savedServers.length > 0 && (
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

        <View style={{ flex: 1.4 }} />
        <Pressable onPress={() => setHelpOpen(true)} style={{ paddingBottom: Math.max(24, insets.bottom) }}>
          <Text style={styles.footer}>
            Need a server? <Text style={{ color: accent }}>Read the setup guide</Text>
          </Text>
        </Pressable>
      </View>

      <BottomSheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="Self-hosting Yarukoto">
        <Text style={styles.helpText}>
          Yarukoto talks to a small self-hosted server that stores your tasks, lists and tags. Deploy the server
          anywhere you like, then enter its URL and an access token here to connect this app to it. Nothing is
          sent anywhere else.
        </Text>
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontFamily: fonts.sansBold,
    fontSize: 28,
    color: colors.textPrimary,
    marginTop: 18,
  },
  tagline: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textSecondary,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  fieldInput: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 15,
    color: colors.textPrimary,
    padding: 0,
  },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.priorityHigh,
  },
  connectBtn: {
    backgroundColor: colors.textPrimary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  connectText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: '#fff',
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
    backgroundColor: colors.border,
  },
  orText: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  sampleBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.surface,
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
    color: colors.textTertiary,
  },
  trustText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  savedLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginTop: 14,
    marginBottom: 8,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
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
    color: colors.textPrimary,
  },
  forgetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  forgetText: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
    color: colors.textFaint,
  },
  footer: {
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
  helpText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
  },
});

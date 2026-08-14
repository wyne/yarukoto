import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import SyncIndicator from '../SyncIndicator';
import { ACCENT_OPTIONS, colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useTheme } from '../../theme/ThemeContext';
import { ApiError, useTasks } from '../../data/TaskContext';
import { lastSyncedLabel } from '../../data/dateUtils';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Appearance, and where the app syncs to. */
export default function ServerSheet({ visible, onClose }: Props) {
  const { state, connect, disconnect, syncStatus } = useTasks();
  const { accent, setAccent } = useTheme();
  const [url, setUrl] = useState(state.serverUrl);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reopening should show what's actually connected, not stale edits.
  useEffect(() => {
    if (visible) {
      setUrl(state.serverUrl);
      setToken('');
      setError(null);
    }
  }, [visible, state.serverUrl]);

  const save = async () => {
    const next = url.trim();
    if (!/^https?:\/\/.+/i.test(next)) {
      setError('Enter a full server URL, starting with http:// or https://');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await connect(next, token);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? 'That token was rejected. Check it and try again.'
            : err.message
          : 'Something went wrong connecting.'
      );
    } finally {
      setSaving(false);
    }
  };

  const sample = state.mode === 'sample';

  return (
    <BottomSheet visible={visible} onClose={onClose} title={sample ? 'Connect to a server' : 'Settings'}>
      {sample && (
        <Text style={styles.sampleNote}>
          You're exploring with sample data. Connecting replaces it with your server's tasks.
        </Text>
      )}

      <Text style={styles.sectionLabel}>Accent</Text>
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

      <Text style={styles.sectionLabel}>Server</Text>

      {state.mode === 'server' && (
        <View style={styles.statusRow}>
          <SyncIndicator mode={state.mode} status={syncStatus} serverUrl={state.serverUrl} />
          <Text style={styles.statusTime}>{lastSyncedLabel(new Date(), syncStatus.lastSyncedAt)}</Text>
        </View>
      )}
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://your-server.example.com"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TextInput
        value={token}
        onChangeText={setToken}
        placeholder="Access token"
        placeholderTextColor={colors.textFaint}
        style={[styles.input, { marginTop: 8 }]}
        secureTextEntry
        autoCapitalize="none"
        onSubmitEditing={save}
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
      </Pressable>

      <Pressable
        style={styles.disconnectBtn}
        onPress={() => {
          disconnect();
          onClose();
        }}
      >
        <Text style={styles.disconnectText}>{sample ? 'Leave sample data' : 'Disconnect'}</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: 8,
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  accentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  /** The ring, not the swatch, carries the selection — the fill stays true to the colour. */
  swatchRing: {
    padding: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 999,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 999,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  statusTime: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: colors.textTertiary,
  },
  sampleNote: {
    marginBottom: 12,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.monoRegular,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  error: {
    marginTop: 8,
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: colors.priorityHigh,
  },
  saveBtn: {
    marginTop: 14,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
  },
  saveText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
  disconnectBtn: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disconnectText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.priorityHigh,
  },
});

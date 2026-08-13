import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import SyncIndicator from '../SyncIndicator';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { ApiError, useTasks } from '../../data/TaskContext';
import { ServerInfo, createApi } from '../../data/api';
import { lastSyncedLabel } from '../../data/dateUtils';

/** e.g. "v1.0.0 · 366ba58" — enough to tell two builds apart at a glance. */
function buildLabel(info: ServerInfo): string {
  const parts = [info.version ? `v${info.version}` : null, info.commitShort].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'version unknown';
}

/** Local calendar date, since the exact minute isn't what you're checking for. */
function formatBuiltAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Point the app at a different server, or drop the connection entirely. */
export default function ServerSheet({ visible, onClose }: Props) {
  const { state, connect, disconnect, syncStatus } = useTasks();
  const [url, setUrl] = useState(state.serverUrl);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<ServerInfo | null | undefined>(undefined);

  // Reopening should show what's actually connected, not stale edits.
  useEffect(() => {
    if (visible) {
      setUrl(state.serverUrl);
      setToken('');
      setError(null);
    }
  }, [visible, state.serverUrl]);

  // Which build the server is running, re-read on every open so it reflects a
  // deploy that happened while the app stayed put. /health needs no token, so this
  // works even when the stored one has been rejected.
  useEffect(() => {
    if (!visible || state.mode !== 'server' || !state.serverUrl) {
      setInfo(undefined);
      return;
    }
    let cancelled = false;
    setInfo(undefined);
    createApi(state.serverUrl, '')
      .health()
      .then((result) => {
        if (!cancelled) setInfo(result);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, state.mode, state.serverUrl]);

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
    <BottomSheet visible={visible} onClose={onClose} title={sample ? 'Connect to a server' : 'Server'}>
      {sample && (
        <Text style={styles.sampleNote}>
          You're exploring with sample data. Connecting replaces it with your server's tasks.
        </Text>
      )}

      {state.mode === 'server' && (
        <View style={styles.statusRow}>
          <SyncIndicator mode={state.mode} status={syncStatus} serverUrl={state.serverUrl} />
          <Text style={styles.statusTime}>{lastSyncedLabel(new Date(), syncStatus.lastSyncedAt)}</Text>
        </View>
      )}
      {state.mode === 'server' && info && (
        <View style={styles.buildBlock}>
          <View style={styles.buildRow}>
            <Text style={styles.buildLabel}>Server build</Text>
            <Text style={styles.buildValue} selectable numberOfLines={1}>
              {buildLabel(info)}
            </Text>
          </View>
          {info.builtAt && <Text style={styles.buildMeta}>Built {formatBuiltAt(info.builtAt)}</Text>}
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
  buildBlock: {
    // The status row above it already carries the gap to the inputs below.
    marginTop: -6,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  buildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  buildLabel: {
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: colors.textTertiary,
  },
  buildValue: {
    flexShrink: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  buildMeta: {
    marginTop: 2,
    fontFamily: fonts.sansRegular,
    fontSize: 11.5,
    color: colors.textFaint,
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

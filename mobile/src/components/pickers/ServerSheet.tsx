import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import BottomSheet from '../BottomSheet';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { ApiError, useTasks } from '../../data/TaskContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Point the app at a different server, or drop the connection entirely. */
export default function ServerSheet({ visible, onClose }: Props) {
  const { state, connect, disconnect } = useTasks();
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
    <BottomSheet visible={visible} onClose={onClose} title={sample ? 'Connect to a server' : 'Server'}>
      {sample && (
        <Text style={styles.sampleNote}>
          You're exploring with sample data. Connecting replaces it with your server's tasks.
        </Text>
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

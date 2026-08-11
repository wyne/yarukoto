import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Point the app at a different server, or drop the connection entirely. */
export default function ServerSheet({ visible, onClose }: Props) {
  const { state, connect, disconnect } = useTasks();
  const [url, setUrl] = useState(state.serverUrl);
  const [error, setError] = useState<string | null>(null);

  // Reopening should show what's actually connected, not stale edits.
  useEffect(() => {
    if (visible) {
      setUrl(state.serverUrl);
      setError(null);
    }
  }, [visible, state.serverUrl]);

  const save = () => {
    const next = url.trim();
    if (!/^https?:\/\/.+/i.test(next)) {
      setError('Enter a full server URL, starting with http:// or https://');
      return;
    }
    connect(next);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Server">
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://your-server.example.com"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onSubmitEditing={save}
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.saveBtn} onPress={save}>
        <Text style={styles.saveText}>Save</Text>
      </Pressable>

      <Pressable
        style={styles.disconnectBtn}
        onPress={() => {
          disconnect();
          onClose();
        }}
      >
        <Text style={styles.disconnectText}>Disconnect</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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

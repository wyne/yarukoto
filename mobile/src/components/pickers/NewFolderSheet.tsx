import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import BottomSheet from '../BottomSheet';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NewFolderSheet({ visible, onClose }: Props) {
  const { addFolder } = useTasks();
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) setName('');
  }, [visible]);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addFolder(trimmed);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="New folder">
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Folder name"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoFocus
        onSubmitEditing={create}
      />
      <Pressable style={[styles.createBtn, !name.trim() && styles.createBtnDisabled]} onPress={create} disabled={!name.trim()}>
        <Text style={styles.createText}>Create</Text>
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
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  createBtn: {
    marginTop: 14,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
  },
  createBtnDisabled: {
    opacity: 0.35,
  },
  createText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
});

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';
import { FolderDef } from '../../data/types';

interface Props {
  /** The folder the list goes into; null closes the sheet. */
  folder: FolderDef | null;
  onClose: () => void;
}

export default function NewListSheet({ folder, onClose }: Props) {
  const { addList } = useTasks();
  const [name, setName] = useState('');

  useEffect(() => {
    if (folder) setName('');
  }, [folder]);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed || !folder) return;
    addList(trimmed, folder.id);
    onClose();
  };

  return (
    <BottomSheet visible={!!folder} onClose={onClose} title={folder ? `New list in ${folder.name}` : 'New list'}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="List name"
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

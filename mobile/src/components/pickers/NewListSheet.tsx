import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import NativeSheet from '../NativeSheet';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';
import { FolderDef } from '../../data/types';

interface Props {
  visible: boolean;
  /**
   * The folder the list goes into, or null for the root — where it sits among
   * the folders rather than inside one. `visible` carries open/closed, because
   * null is now a destination in its own right.
   */
  folder: FolderDef | null;
  onClose: () => void;
}

export default function NewListSheet({ visible, folder, onClose }: Props) {
  const { addList } = useTasks();
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) setName('');
  }, [visible]);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addList(trimmed, folder?.id ?? null);
    onClose();
  };

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      title={folder ? `New list in ${folder.name}` : 'New list'}
      keyboard
      // Focus when the sheet presents, not on mount (the sheet can stay mounted
      // hidden), so the keyboard rises with the sheet.
      onShow={() => inputRef.current?.focus()}
    >
      <TextInput
        ref={inputRef}
        value={name}
        onChangeText={setName}
        placeholder="List name"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        onSubmitEditing={create}
      />
      <Pressable style={[styles.createBtn, !name.trim() && styles.createBtnDisabled]} onPress={create} disabled={!name.trim()}>
        <Text style={styles.createText}>Create</Text>
      </Pressable>
    </NativeSheet>
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

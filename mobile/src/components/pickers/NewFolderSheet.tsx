import React, { useEffect, useRef, useState } from 'react';
import { useColors } from '../../theme/ThemeContext';
import { Pressable, Text, TextInput } from 'react-native';
import NativeSheet from '../NativeSheet';
import NativeOwnedTextInput from '../NativeOwnedTextInput';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NewFolderSheet({ visible, onClose }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const { addFolder } = useTasks();
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);

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
    <NativeSheet
      visible={visible}
      onClose={onClose}
      title="New folder"
      keyboard
      // Focus when the sheet presents, not on mount (the sheet can stay mounted
      // hidden), so the keyboard rises with the sheet.
      onShow={() => inputRef.current?.focus()}
    >
      <NativeOwnedTextInput
        ref={inputRef}
        sheet
        syncKey={visible}
        value={name}
        onChangeText={setName}
        placeholder="Folder name"
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

const useStyles = makeStyles((c) => ({
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
    backgroundColor: c.surface,
  },
  createBtn: {
    marginTop: 14,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: c.inverseSurface,
  },
  createBtnDisabled: {
    opacity: 0.35,
  },
  createText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.inverseText,
  },
}));

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import BottomSheet from '../BottomSheet';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';
import { FolderDef } from '../../data/types';
import { listsInFolder } from '../../data/selectors';
import { confirmDestructive } from '../../data/confirm';

interface Props {
  /** The folder being edited; null closes the sheet. */
  folder: FolderDef | null;
  onClose: () => void;
}

/** Rename or delete a folder. Deleting takes its lists with it — see below. */
export default function FolderOptionsSheet({ folder, onClose }: Props) {
  const { state, renameFolder, deleteFolder } = useTasks();
  const [name, setName] = useState('');

  useEffect(() => {
    if (folder) setName(folder.name);
  }, [folder]);

  if (!folder) return <BottomSheet visible={false} onClose={onClose} title="Folder" children={null} />;

  const lists = listsInFolder(state.lists, folder.id);
  const listIds = new Set(lists.map((l) => l.id));
  const taskCount = state.tasks.filter((t) => t.listId && listIds.has(t.listId) && !t.deletedAt).length;
  const trimmed = name.trim();
  const renamed = trimmed && trimmed !== folder.name;

  const commitRename = () => {
    if (renamed) renameFolder(folder.id, trimmed);
    onClose();
  };

  const confirmDelete = () => {
    // A list can't exist outside a folder, so this necessarily cascades. Spell
    // out both consequences rather than letting one tap quietly take a lot away.
    const parts: string[] = [];
    if (lists.length > 0) {
      parts.push(`${lists.length} list${lists.length === 1 ? '' : 's'} will be deleted too`);
    }
    parts.push(
      taskCount === 0
        ? 'no tasks are affected'
        : `${taskCount} task${taskCount === 1 ? '' : 's'} will move to Inbox, not be deleted`
    );
    confirmDestructive(`Delete "${folder.name}"?`, `${parts.join(', and ')}.`, () => {
      deleteFolder(folder.id);
      onClose();
    });
  };

  return (
    <BottomSheet visible onClose={onClose} title={`Edit ${folder.name}`}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Folder name"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        onSubmitEditing={commitRename}
        returnKeyType="done"
      />

      <Text style={styles.hint}>
        {lists.length === 0
          ? 'This folder has no lists.'
          : `Holds ${lists.length} list${lists.length === 1 ? '' : 's'}.`}
      </Text>

      <Pressable
        style={[styles.saveBtn, !renamed && styles.saveBtnDisabled]}
        onPress={commitRename}
        disabled={!renamed}
      >
        <Text style={styles.saveText}>{renamed ? 'Save name' : 'Done'}</Text>
      </Pressable>

      <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
        <Text style={styles.deleteText}>Delete folder</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  hint: {
    marginTop: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: colors.textTertiary,
  },
  saveBtn: {
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
  },
  saveBtnDisabled: {
    backgroundColor: colors.textFaint,
  },
  saveText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
  deleteBtn: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.priorityHigh,
  },
});

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import { LIST_COLORS, colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';
import { ListDef } from '../../data/types';
import { confirmDestructive } from '../../data/confirm';
import { IconCheckBig } from '../../icons/Icons';

interface Props {
  /** The list being edited; null closes the sheet. */
  list: ListDef | null;
  onClose: () => void;
}

/** Rename, recolour or delete a list. Replaces the colour-only sheet. */
export default function ListOptionsSheet({ list, onClose }: Props) {
  const { state, setListColor, renameList, deleteList } = useTasks();
  const [name, setName] = useState('');

  useEffect(() => {
    if (list) setName(list.name);
  }, [list]);

  if (!list) return <BottomSheet visible={false} onClose={onClose} title="List" children={null} />;

  const taskCount = state.tasks.filter((t) => t.listId === list.id && !t.deletedAt).length;
  const trimmed = name.trim();
  const renamed = trimmed && trimmed !== list.name;

  const commitRename = () => {
    if (renamed) renameList(list.id, trimmed);
    onClose();
  };

  const confirmDelete = () => {
    // Say what happens to the tasks — "delete list" is otherwise ambiguous about
    // whether it takes them with it.
    const fate =
      taskCount === 0
        ? 'It has no tasks.'
        : `Its ${taskCount} task${taskCount === 1 ? '' : 's'} will move to Inbox, not be deleted.`;
    confirmDestructive(`Delete "${list.name}"?`, fate, () => {
      deleteList(list.id);
      onClose();
    });
  };

  return (
    <BottomSheet visible onClose={onClose} title={`Edit ${list.name}`}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="List name"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        onSubmitEditing={commitRename}
        returnKeyType="done"
      />

      <Text style={styles.label}>Colour</Text>
      <View style={styles.swatches}>
        {LIST_COLORS.map((color) => {
          const active = list.color === color;
          return (
            <Pressable
              key={color}
              onPress={() => setListColor(list.id, color)}
              style={[styles.swatch, { backgroundColor: color }, active && styles.swatchActive]}
              accessibilityLabel={`Set colour ${color}`}
            >
              {active && <IconCheckBig size={16} color="#fff" strokeWidth={2.6} />}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.saveBtn, !renamed && styles.saveBtnDisabled]}
        onPress={commitRename}
        disabled={!renamed}
      >
        <Text style={styles.saveText}>{renamed ? 'Save name' : 'Done'}</Text>
      </Pressable>

      <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
        <Text style={styles.deleteText}>Delete list</Text>
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
    marginBottom: 18,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
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

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { useColors } from '../../theme/ThemeContext';
import Sheet from '../Sheet';
import NativeOwnedTextInput from '../NativeOwnedTextInput';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';
import { SavedFilter } from '../../data/types';
import { TaskCriteria, isEmptyCriteria, sameCriteria } from '../../data/taskFilter';
import { confirmDestructive } from '../../data/confirm';

export type SavedFilterTarget =
  | { kind: 'new'; criteria: TaskCriteria }
  | { kind: 'edit'; filter: SavedFilter; current: TaskCriteria };

interface Props {
  /** What is being saved or edited; null closes the sheet. */
  target: SavedFilterTarget | null;
  onClose: () => void;
}

/**
 * Names a new saved filter, or renames, re-points or deletes an existing one.
 *
 * One sheet for both because they are the same form: a name, and the criteria
 * it stands for. Editing offers to replace a filter's criteria with what Browse
 * is currently asking, which is how you change one — adjust the chips, then save
 * over it — rather than a second copy of every filter control in here.
 */
export default function SavedFilterSheet({ target, onClose }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const { addSavedFilter, updateSavedFilter, deleteSavedFilter } = useTasks();
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);

  const editing = target?.kind === 'edit' ? target.filter : null;
  useEffect(() => {
    setName(editing ? editing.name : '');
  }, [target, editing]);

  if (!target) return <Sheet visible={false} onClose={onClose} title="Saved filter" children={null} />;

  const trimmed = name.trim();
  const canReplace =
    target.kind === 'edit' && !isEmptyCriteria(target.current) && !sameCriteria(target.current, target.filter.criteria);

  const save = () => {
    if (!trimmed) return;
    if (target.kind === 'new') addSavedFilter(trimmed, target.criteria);
    else if (trimmed !== target.filter.name) updateSavedFilter(target.filter.id, { name: trimmed });
    onClose();
  };

  const replace = () => {
    if (target.kind !== 'edit') return;
    updateSavedFilter(target.filter.id, {
      criteria: target.current,
      ...(trimmed && trimmed !== target.filter.name ? { name: trimmed } : {}),
    });
    onClose();
  };

  const remove = () => {
    if (target.kind !== 'edit') return;
    confirmDestructive(`Delete "${target.filter.name}"?`, 'Your tasks are not affected.', () => {
      deleteSavedFilter(target.filter.id);
      onClose();
    });
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={target.kind === 'new' ? 'Save filter' : `Edit ${target.filter.name}`}
      keyboard
      onShow={() => inputRef.current?.focus()}
    >
      <Text style={styles.label}>Name</Text>
      <NativeOwnedTextInput
        ref={inputRef}
        sheet
        syncKey={editing?.id ?? 'new'}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Tasks today"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        onSubmitEditing={save}
        returnKeyType="done"
      />

      <Pressable style={[styles.primaryBtn, !trimmed && styles.disabled]} onPress={save} disabled={!trimmed}>
        <Text style={styles.primaryText}>{target.kind === 'new' ? 'Save' : 'Save name'}</Text>
      </Pressable>

      {canReplace && (
        <Pressable style={styles.secondaryBtn} onPress={replace}>
          <Text style={styles.secondaryText}>Use current filters</Text>
        </Pressable>
      )}

      {target.kind === 'edit' && (
        <Pressable style={styles.secondaryBtn} onPress={remove}>
          <Text style={styles.deleteText}>Delete saved filter</Text>
        </Pressable>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
    backgroundColor: c.surface,
  },
  primaryBtn: {
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: c.inverseSurface,
  },
  disabled: {
    opacity: 0.35,
  },
  primaryText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.inverseText,
  },
  secondaryBtn: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.textPrimary,
  },
  deleteText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.priorityHigh,
  },
}));

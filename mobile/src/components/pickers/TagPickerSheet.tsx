import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { tagCounts } from '../../data/selectors';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to BottomSheet: a point makes this a popover on wide web. */
  anchor?: PopoverAnchor | null;
  initialTags: string[];
  onApply: (tags: string[]) => void;
}

export default function TagPickerSheet({ visible, onClose, initialTags, onApply, anchor }: Props) {
  const accent = useAccent();
  const { state } = useTasks();
  const [selected, setSelected] = useState<string[]>(initialTags);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (visible) setSelected(initialTags);
  }, [visible, initialTags]);

  const knownTags = tagCounts(state.tasks).map((t) => t.tag);
  const allTags = Array.from(new Set([...knownTags, ...selected]));

  const toggle = (tag: string) => {
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const addNewTag = () => {
    const t = newTag.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !selected.includes(t)) setSelected((prev) => [...prev, t]);
    setNewTag('');
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Tags"
      anchor={anchor}
      popoverWidth={300}
    >
      <View style={styles.chipsRow}>
        {allTags.map((tag) => {
          const active = selected.includes(tag);
          return (
            <Pressable
              key={tag}
              style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => toggle(tag)}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>#{tag}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.addRow}>
        <TextInput
          value={newTag}
          onChangeText={setNewTag}
          placeholder="New tag"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          onSubmitEditing={addNewTag}
          returnKeyType="done"
        />
        <Pressable style={[styles.addBtn, { borderColor: accent }]} onPress={addNewTag}>
          <Text style={{ color: accent, fontFamily: fonts.sansMedium, fontSize: 13 }}>Add</Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.applyBtn, { backgroundColor: colors.textPrimary }]}
        onPress={() => {
          onApply(selected);
          onClose();
        }}
      >
        <Text style={styles.applyText}>Apply</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  addBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  applyBtn: {
    marginTop: 18,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
});

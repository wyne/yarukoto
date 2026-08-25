import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import { makeStyles } from '../../theme/styles';
import { useHoverBg } from '../../theme/hover';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { tagCounts } from '../../data/selectors';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to BottomSheet: a point makes this a popover on wide web. */
  anchor?: PopoverAnchor | null;
  /** Forwarded to BottomSheet: returns to the menu that opened this. */
  onBack?: () => void;
  initialTags: string[];
  onApply: (tags: string[]) => void;
}

export default function TagPickerSheet({ visible, onClose, initialTags, onApply, anchor, onBack }: Props) {
  const hoverBg = useHoverBg();
  const colors = useColors();
  const styles = useStyles();
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
      onBack={onBack}
    >
      <View style={styles.chipsRow}>
        {allTags.map((tag) => {
          const active = selected.includes(tag);
          return (
            <Pressable
              key={tag}
              style={hoverBg([styles.chip, active && { backgroundColor: accent, borderColor: accent }], active)}
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
          <Text style={{ color: accent, fontFamily: fonts.sansMedium, fontSize: 14 }}>Add</Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.applyBtn, { backgroundColor: colors.inverseSurface }]}
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

const useStyles = makeStyles((c) => ({
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: fonts.monoRegular,
    fontSize: 14,
    color: c.textSecondary,
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
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
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
    fontSize: 16,
    color: c.inverseText,
  },
}));

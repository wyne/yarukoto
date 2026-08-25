import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import { colors } from '../../theme/colors';
import { hoverBg } from '../../theme/hover';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { navGroups } from '../../data/selectors';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to BottomSheet: a point makes this a popover on wide web. */
  anchor?: PopoverAnchor | null;
  /** Forwarded to BottomSheet: returns to the menu that opened this. */
  onBack?: () => void;
  value: string | null;
  onApply: (listId: string | null) => void;
}

export default function ListPickerSheet({ visible, onClose, value, onApply, anchor, onBack }: Props) {
  const accent = useAccent();
  const { state } = useTasks();

  const choose = (listId: string | null) => {
    onApply(listId);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Move to list"
      anchor={anchor}
      popoverWidth={280}
      onBack={onBack}
    >
      <Pressable style={hoverBg(styles.row)} onPress={() => choose(null)}>
        <Text style={[styles.rowText, value === null && { color: accent, fontFamily: fonts.sansSemiBold }]}>Inbox</Text>
      </Pressable>
      {navGroups(state.lists, state.folders).map((group) => (
        <View key={group.folder?.id ?? 'root'}>
          {group.folder && <Text style={styles.folderLabel}>{group.folder.name}</Text>}
          {group.lists.map((list) => (
            <Pressable key={list.id} style={hoverBg(styles.row)} onPress={() => choose(list.id)}>
              <View style={[styles.dot, { backgroundColor: list.color }]} />
              <Text style={[styles.rowText, value === list.id && { color: accent, fontFamily: fonts.sansSemiBold }]}>
                {list.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  folderLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginTop: 10,
    marginBottom: 2,
  },
});

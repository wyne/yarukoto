import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import {
  activeFolders,
  listsInFolder,
} from '../../data/selectors';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to BottomSheet: a point makes this a popover on wide web. */
  anchor?: PopoverAnchor | null;
  value: string | null;
  onApply: (listId: string | null) => void;
}

export default function ListPickerSheet({ visible, onClose, value, onApply, anchor }: Props) {
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
    >
      <Pressable style={styles.row} onPress={() => choose(null)}>
        <Text style={[styles.rowText, value === null && { color: accent, fontFamily: fonts.sansSemiBold }]}>Inbox</Text>
      </Pressable>
      {activeFolders(state.folders).map((folder) => (
        <View key={folder.id}>
          <Text style={styles.folderLabel}>{folder.name}</Text>
          {listsInFolder(state.lists, folder.id).map((list) => (
            <Pressable key={list.id} style={styles.row} onPress={() => choose(list.id)}>
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
    fontSize: 15,
    color: colors.textPrimary,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  folderLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginTop: 10,
    marginBottom: 2,
  },
});

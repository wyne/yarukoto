import React from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import { makeStyles } from '../../theme/styles';
import { useHoverBg } from '../../theme/hover';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { IconInboxTray } from '../../icons/Icons';
import { useTasks } from '../../data/TaskContext';
import { navGroups } from '../../data/selectors';

/**
 * One nesting step, matching the sidebar's.
 *
 * The nav interleaves folders with the lists that aren't in one, so a root list
 * can sort after a folder and land directly under that folder's own lists. With
 * every row in the same column the folder heading above is the only cue, and it
 * points the wrong way — the indent is what says which rows the heading covers.
 */
const INDENT = 22;

/**
 * How much of the screen the sheet may grow into before the list starts
 * scrolling instead. Also the detent it can be dragged up to, so a short list
 * opens at its own height and can still be pulled taller.
 */
const MAX_HEIGHT_RATIO = 0.85;

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
  const hoverBg = useHoverBg();
  const styles = useStyles();
  const accent = useAccent();
  const { state } = useTasks();
  const { height } = useWindowDimensions();

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
      stackBehavior="push"
      scroll
      maxHeight={Math.round(height * MAX_HEIGHT_RATIO)}
    >
      <Pressable style={hoverBg(styles.row)} onPress={() => choose(null)}>
        <View style={styles.leading}>
          <IconInboxTray size={16} color={value === null ? accent : undefined} />
        </View>
        <Text style={[styles.rowText, value === null && { color: accent, fontFamily: fonts.sansSemiBold }]}>Inbox</Text>
      </Pressable>
      {navGroups(state.lists, state.folders).map((group) => (
        <View key={group.folder?.id ?? 'root'}>
          {group.folder && <Text style={styles.folderLabel}>{group.folder.name}</Text>}
          {group.lists.map((list) => (
            <Pressable
              key={list.id}
              style={hoverBg([styles.row, !!group.folder && styles.nestedRow])}
              onPress={() => choose(list.id)}
            >
              <View style={styles.leading}>
                <View style={[styles.dot, { backgroundColor: list.color }]} />
              </View>
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

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  /** Padding, not margin: the divider stays full-bleed and the whole row stays pressable. */
  nestedRow: {
    paddingLeft: INDENT,
  },
  rowText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
  },
  leading: {
    width: 16,
    alignItems: 'center',
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
    color: c.textTertiary,
    marginTop: 10,
    marginBottom: 2,
  },
}));

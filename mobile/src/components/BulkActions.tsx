import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { hoverBg } from '../theme/hover';
import { useTasks } from '../data/TaskContext';
import { useSelection } from '../navigation/SelectionContext';
import { addDays, toISODate } from '../data/dateUtils';
import Tooltip from './Tooltip';
import type { PopoverAnchor } from './Popover';
import DueDatePickerSheet from './pickers/DueDatePickerSheet';
import ListPickerSheet from './pickers/ListPickerSheet';
import TagPickerSheet from './pickers/TagPickerSheet';
import PriorityPickerSheet from './pickers/PriorityPickerSheet';
import {
  IconCalendarBox,
  IconCheckBig,
  IconClock,
  IconFlag,
  IconStack,
  IconTag,
  IconTrash,
} from '../icons/Icons';

type Picker = 'date' | 'priority' | 'move' | 'tags' | null;

interface Props {
  /**
   * 'pane' fills the column beside the list, where the task detail otherwise
   * sits. 'bar' floats over the list when there is no column to spare.
   */
  variant: 'pane' | 'bar';
}

/**
 * What you can do to several tasks at once.
 *
 * One set of actions, two shapes. Both drive the same bulk edits and open the
 * same pickers the rest of the app uses, so a bulk change and a single one can
 * never drift apart.
 */
export default function BulkActions({ variant }: Props) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { state, bulkUpdate, deleteTasks, toggleComplete } = useTasks();
  const { selectedIds, clear } = useSelection();
  const [picker, setPicker] = useState<Picker>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const barRef = useRef<View>(null);

  const count = selectedIds.length;

  /**
   * After an edit the selection stands: setting a date and then a priority on
   * the same rows is one thought, and having to reselect between them would make
   * it two.
   */
  const applied = () => setPicker(null);

  /** For the two that empty the list of what was selected. */
  const finished = () => {
    setPicker(null);
    clear();
  };

  /**
   * Anchors a picker to the bar it was opened from, so the popover appears over
   * the list rather than sliding up from the bottom of the window. The pane is
   * tall and its own rows are the anchor, so it measures per press instead.
   */
  const openPicker = (which: Picker, at?: PopoverAnchor) => {
    if (at) setAnchor(at);
    setPicker(which);
  };

  const measureThen = (which: Picker) => (e: { currentTarget: unknown }) => {
    const node = e.currentTarget as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, width, height) => openPicker(which, { x, y, width, height }));
    } else {
      openPicker(which);
    }
  };

  const postpone = () => {
    // Same one-day nudge the row's own Later action gives, applied across the
    // selection: every task moves to tomorrow rather than each shifting by a day
    // from wherever it already sat.
    bulkUpdate(selectedIds, { dueDate: toISODate(addDays(new Date(), 1)) });
    applied();
  };

  const completeAll = () => {
    selectedIds.forEach((id) => {
      const task = state.tasks.find((t) => t.id === id);
      if (task && !task.completed) toggleComplete(id);
    });
    // Completing takes the rows out of the list, so there is nothing left to
    // keep selected.
    finished();
  };

  const removeAll = () => {
    deleteTasks(selectedIds);
    finished();
  };

  const actions = [
    { key: 'date', label: 'Due date', icon: IconCalendarBox, onPress: measureThen('date') },
    { key: 'postpone', label: 'Postpone', icon: IconClock, onPress: postpone },
    { key: 'priority', label: 'Priority', icon: IconFlag, onPress: measureThen('priority') },
    { key: 'move', label: 'Move to', icon: IconStack, onPress: measureThen('move') },
    { key: 'tags', label: 'Tags', icon: IconTag, onPress: measureThen('tags') },
  ] as const;

  const pickers = (
    <>
      <DueDatePickerSheet
        visible={picker === 'date'}
        onClose={() => setPicker(null)}
        anchor={anchor}
        onApply={(dueDate, dueTime) => {
          bulkUpdate(selectedIds, { dueDate, dueTime });
          applied();
        }}
      />
      <PriorityPickerSheet
        visible={picker === 'priority'}
        onClose={() => setPicker(null)}
        anchor={anchor}
        onApply={(priority) => {
          bulkUpdate(selectedIds, { priority });
          applied();
        }}
      />
      <ListPickerSheet
        visible={picker === 'move'}
        onClose={() => setPicker(null)}
        anchor={anchor}
        value={null}
        onApply={(listId) => {
          bulkUpdate(selectedIds, { listId });
          applied();
        }}
      />
      <TagPickerSheet
        visible={picker === 'tags'}
        onClose={() => setPicker(null)}
        anchor={anchor}
        initialTags={[]}
        onApply={(tags) => {
          selectedIds.forEach((id) => {
            const t = state.tasks.find((x) => x.id === id);
            if (t) bulkUpdate([id], { tags: Array.from(new Set([...t.tags, ...tags])) });
          });
          applied();
        }}
      />
    </>
  );

  if (variant === 'bar') {
    return (
      <>
        <View ref={barRef} style={[styles.barWrap, { bottom: Math.max(24, insets.bottom + 16) }]}>
          <View style={styles.bar}>
            {actions.map(({ key, label, icon: Icon, onPress }) => (
              <Tooltip key={key} label={label} align="center" placement="above">
                <Pressable style={hoverBg(styles.barBtn)} onPress={onPress}>
                  <Icon size={18} color={colors.textSecondary} />
                </Pressable>
              </Tooltip>
            ))}
            <Tooltip label="Mark as done" align="center" placement="above">
              <Pressable style={hoverBg(styles.barBtn)} onPress={completeAll}>
                <IconCheckBig size={17} color={colors.success} strokeWidth={2} />
              </Pressable>
            </Tooltip>
            <View style={styles.barDivider} />
            <Tooltip label="Delete" align="center" placement="above">
              <Pressable style={hoverBg(styles.barBtn)} onPress={removeAll}>
                <IconTrash size={17} />
              </Pressable>
            </Tooltip>
            <Tooltip label="Cancel" align="center" placement="above">
              <Pressable style={hoverBg(styles.barBtn)} onPress={clear}>
                <Text style={styles.barCancel}>✕</Text>
              </Pressable>
            </Tooltip>
          </View>
        </View>
        {pickers}
      </>
    );
  }

  return (
    <View style={styles.pane}>
      <View style={styles.paneHeader}>
        <Text style={styles.paneCount}>
          You have chosen <Text style={styles.paneCountNum}>{count}</Text>{' '}
          {count === 1 ? 'item' : 'items'}
        </Text>
        <Pressable onPress={clear} hitSlop={8}>
          <Text style={[styles.cancel, { color: accent }]}>Cancel</Text>
        </Pressable>
      </View>

      {actions.map(({ key, label, icon: Icon, onPress }) => (
        <Pressable key={key} style={hoverBg(styles.paneRow)} onPress={onPress}>
          <Icon size={17} color={colors.textSecondary} />
          <Text style={styles.paneRowText}>{label}</Text>
        </Pressable>
      ))}

      <View style={styles.grid}>
        <Pressable style={hoverBg(styles.tile)} onPress={completeAll}>
          <IconCheckBig size={18} color={colors.success} strokeWidth={2} />
          <Text style={styles.tileText}>Done</Text>
        </Pressable>
        <Pressable style={hoverBg(styles.tile)} onPress={removeAll}>
          <IconTrash size={18} />
          <Text style={[styles.tileText, { color: colors.priorityHigh }]}>Delete</Text>
        </Pressable>
      </View>

      {pickers}
    </View>
  );
}

const styles = StyleSheet.create({
  // Pane
  pane: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  paneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  paneCount: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textSecondary,
  },
  paneCountNum: {
    fontFamily: fonts.sansSemiBold,
    color: colors.textPrimary,
  },
  cancel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
  paneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  paneRowText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.textPrimary,
  },

  // Floating bar
  barWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.18)',
  },
  barBtn: {
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  barDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 4,
    backgroundColor: colors.divider,
  },
  barCancel: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textTertiary,
  },
});

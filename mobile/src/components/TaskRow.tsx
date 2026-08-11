import React from 'react';
import { GestureResponderHandlers, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { Task, ListDef } from '../data/types';
import { formatDueShort, isOverdue } from '../data/dateUtils';
import TaskCheckbox from './TaskCheckbox';
import SwipeableRow from './SwipeableRow';
import { IconCheckBig, IconGrip, IconStar } from '../icons/Icons';

interface Props {
  task: Task;
  list?: ListDef;
  now: Date;
  selectionMode?: boolean;
  selected?: boolean;
  /**
   * Whether there's room for list and tag names beside the title. Narrow layouts
   * pass false: on one line they crowd out the title, and the due date matters more.
   */
  showContext?: boolean;
  /** Suppressed as redundant when the whole view or group is already this list. */
  hideListId?: string;
  /** Suppressed as redundant when the whole view or group is already this tag. */
  hideTag?: string;
  /** Present only when the row is reorderable; spread onto the drag handle. */
  dragHandleProps?: GestureResponderHandlers;
  onPress: () => void;
  onLongPress?: () => void;
  onToggleComplete: () => void;
  onLater: () => void;
  onDone: () => void;
}

export default function TaskRow({
  task,
  list,
  now,
  selectionMode,
  selected,
  showContext = true,
  hideListId,
  hideTag,
  dragHandleProps,
  onPress,
  onLongPress,
  onToggleComplete,
  onLater,
  onDone,
}: Props) {
  const accent = useAccent();
  const dueLabel = formatDueShort(now, task.dueDate, task.dueTime);
  const overdue = isOverdue(now, task);
  // Whatever the current view is already scoped to is dropped: repeating "Home" on
  // every row of the Home list is noise. Other tags on the task still show.
  const listName = hideListId && task.listId === hideListId ? null : list?.name;
  const visibleTags = hideTag ? task.tags.filter((t) => t !== hideTag) : task.tags;
  const tagsStr = visibleTags.length ? visibleTags.map((t) => `#${t}`).join(' ') : null;
  const restParts = [listName, tagsStr].filter(Boolean) as string[];
  const showRest = showContext && restParts.length > 0;
  const showStar = overdue && task.priority === 'high' && !task.completed;
  const subtaskDone = task.subtasks.filter((s) => s.done).length;
  const showBadge = !showStar && task.subtasks.length > 0 && !task.completed;

  const row = (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.row, selected && { backgroundColor: colors.selectedRowBg }, task.completed && styles.rowCompleted]}
    >
      {selectionMode ? (
        <Pressable onPress={onPress} hitSlop={10}>
          <View
            style={[
              styles.selectCircle,
              selected ? { backgroundColor: accent, borderColor: accent } : { borderColor: colors.ringNone },
            ]}
          >
            {selected && <IconCheckBig size={11} color="#fff" strokeWidth={1.8} />}
          </View>
        </Pressable>
      ) : (
        <TaskCheckbox completed={task.completed} priority={task.priority} onPress={onToggleComplete} />
      )}
      <Text style={[styles.title, task.completed && styles.titleCompleted]} numberOfLines={1}>
        {task.title}
      </Text>
      {(dueLabel || showRest) && !task.completed && (
        <View style={styles.metaRow}>
          {showRest && (
            <Text style={[styles.metaMuted, styles.metaRest]} numberOfLines={1}>
              {restParts.join(' · ')}
            </Text>
          )}
          {dueLabel && (
            <Text style={[overdue ? styles.metaOverdue : styles.metaMuted, styles.metaDue]} numberOfLines={1}>
              {dueLabel}
            </Text>
          )}
        </View>
      )}
      {showStar && <IconStar size={14} color={colors.priorityHigh} />}
      {showBadge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {subtaskDone}/{task.subtasks.length}
          </Text>
        </View>
      )}
      {dragHandleProps && (
        <View style={styles.handle} accessibilityLabel="Drag to reorder" {...dragHandleProps}>
          <IconGrip />
        </View>
      )}
    </Pressable>
  );

  if (selectionMode || task.completed) return row;

  return (
    <SwipeableRow onLater={onLater} onDone={onDone}>
      {row}
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
    backgroundColor: colors.surface,
  },
  rowCompleted: {
    opacity: 0.55,
  },
  title: {
    flex: 1,
    // Guarantees the title never collapses entirely behind long metadata.
    minWidth: 64,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    // Keeps the row title-first when a task carries a list and several tags.
    maxWidth: '52%',
  },
  /** List and tags give up space before the due date does. */
  metaRest: {
    flexShrink: 1,
  },
  /** A truncated date is useless, so it never shrinks. */
  metaDue: {
    flexShrink: 0,
  },
  metaOverdue: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: colors.priorityHigh,
  },
  metaMuted: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: colors.textTertiary,
  },
  handle: {
    marginLeft: -2,
    marginRight: -4,
    paddingHorizontal: 4,
    paddingVertical: 6,
    // @ts-expect-error web-only affordance; ignored on native
    cursor: 'grab',
  },
  badge: {
    backgroundColor: colors.chipBg,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.textTertiary,
  },
  selectCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

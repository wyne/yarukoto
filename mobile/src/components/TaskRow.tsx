import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { Task, ListDef } from '../data/types';
import { formatDueShort, isOverdue } from '../data/dateUtils';
import TaskCheckbox from './TaskCheckbox';
import SwipeableRow from './SwipeableRow';
import { IconCheckBig, IconStar } from '../icons/Icons';

interface Props {
  task: Task;
  list?: ListDef;
  now: Date;
  selectionMode?: boolean;
  selected?: boolean;
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
  onPress,
  onLongPress,
  onToggleComplete,
  onLater,
  onDone,
}: Props) {
  const accent = useAccent();
  const dueLabel = formatDueShort(now, task.dueDate, task.dueTime);
  const overdue = isOverdue(now, task);
  const tagsStr = task.tags.length ? task.tags.map((t) => `#${t}`).join(' ') : null;
  const restParts = [list?.name, tagsStr].filter(Boolean) as string[];
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
      <View style={styles.body}>
        <Text
          style={[styles.title, task.completed && styles.titleCompleted]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        {(dueLabel || restParts.length > 0) && !task.completed && (
          <Text style={styles.meta} numberOfLines={1}>
            {dueLabel ? <Text style={overdue ? styles.metaOverdue : styles.metaMuted}>{dueLabel}</Text> : null}
            {dueLabel && restParts.length > 0 ? (
              <Text style={styles.metaMuted}>{' · '}</Text>
            ) : null}
            {restParts.length > 0 ? <Text style={styles.metaMuted}>{restParts.join(' · ')}</Text> : null}
          </Text>
        )}
      </View>
      {showStar && <IconStar size={14} color={colors.priorityHigh} />}
      {showBadge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {subtaskDone}/{task.subtasks.length}
          </Text>
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
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  meta: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    marginTop: 2,
  },
  metaOverdue: {
    color: colors.priorityHigh,
    fontFamily: fonts.monoRegular,
  },
  metaMuted: {
    color: colors.textTertiary,
    fontFamily: fonts.monoRegular,
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

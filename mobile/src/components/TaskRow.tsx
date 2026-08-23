import React from 'react';
import {
  GestureResponderEvent,
  GestureResponderHandlers,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { hoverable } from '../theme/hover';
import { Task, ListDef } from '../data/types';
import { formatDueShort, isOverdue } from '../data/dateUtils';
import TaskCheckbox from './TaskCheckbox';
import SwipeableRow from './SwipeableRow';
import { IconCheckBig, IconGrip, IconNote, IconStar, IconTag } from '../icons/Icons';

interface Props {
  task: Task;
  list?: ListDef;
  now: Date;
  selectionMode?: boolean;
  selected?: boolean;
  /**
   * How much room there is beside the title.
   *
   * 'full' spells out the list and the tags. 'tags' drops the list name, which
   * the view usually implies anyway, and keeps the tags. 'count' has room for
   * neither and shows how many tags there are instead — enough to know a task
   * is tagged, and which ones is a tap away.
   */
  showContext?: boolean | 'tags' | 'count';
  /** Suppressed as redundant when the whole view or group is already this list. */
  hideListId?: string;
  /** Suppressed as redundant when the whole view or group is already this tag. */
  hideTag?: string;
  /** Present only when the row is reorderable; spread onto the drag handle. */
  dragHandleProps?: GestureResponderHandlers;
  /**
   * Shows the grip without attaching handlers — for rows where the whole row is
   * the drag target and the grip is only the affordance.
   */
  showHandle?: boolean;
  /** Rendered before the checkbox. The calendar puts the due time here. */
  leading?: React.ReactNode;
  /** Drop the due label when the surrounding view already states the date. */
  hideDue?: boolean;
  /** Shaded while it is the task being dragged, marking it as the drag source. */
  dragSource?: boolean;
  /**
   * Reserves room at the trailing edge for the drag grip, which is drawn over
   * the row from outside it. Held open whether or not the grip is showing, so
   * the metadata doesn't shift sideways as the pointer arrives.
   */
  handleGutter?: boolean;
  /**
   * Held in the hover state while this is the row being acted on — a context
   * menu, a picker one opened, or the task shown in the detail pane. Moving the
   * pointer away shouldn't lose track of which task the surrounding UI is about.
   */
  active?: boolean;
  onPress: () => void;
  onLongPress?: (e: GestureResponderEvent) => void;
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
  showHandle,
  leading,
  hideDue,
  dragSource,
  handleGutter,
  active,
  onPress,
  onLongPress,
  onToggleComplete,
  onLater,
  onDone,
}: Props) {
  const accent = useAccent();
  const dueLabel = hideDue ? null : formatDueShort(now, task.dueDate, task.dueTime);
  const overdue = isOverdue(now, task);
  // Whatever the current view is already scoped to is dropped: repeating "Home" on
  // every row of the Home list is noise. Other tags on the task still show.
  const listName = hideListId && task.listId === hideListId ? null : list?.name;
  const visibleTags = hideTag ? task.tags.filter((t) => t !== hideTag) : task.tags;
  const tagsStr = visibleTags.length ? visibleTags.map((t) => `#${t}`).join(' ') : null;
  const level = showContext === true ? 'full' : showContext || 'none';
  const restParts = (level === 'full' ? [listName, tagsStr] : [tagsStr]).filter(Boolean) as string[];
  const showRest = (level === 'full' || level === 'tags') && restParts.length > 0;
  const tagCount = level === 'count' && !task.completed ? visibleTags.length : 0;
  const hasNotes = task.notes.trim().length > 0;
  const showStar = overdue && task.priority === 'high' && !task.completed;
  const subtaskDone = task.subtasks.filter((s) => s.done).length;
  const showBadge = !showStar && task.subtasks.length > 0 && !task.completed;

  const row = (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      // Hover last so it can't paint over selection or the drag source tint,
      // which say more about the row than the pointer's position does.
      style={hoverable(
        [
          styles.row,
          selected && { backgroundColor: colors.selectedRowBg },
          dragSource && { backgroundColor: colors.accentTintBg },
          task.completed && styles.rowCompleted,
          handleGutter && styles.rowHandleGutter,
          active && !selected && !dragSource && styles.rowHovered,
        ],
        !selected && !dragSource ? styles.rowHovered : null
      )}
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
      {leading}
      <View style={styles.titleRow}>
        <Text style={[styles.title, task.completed && styles.titleCompleted]} numberOfLines={1}>
          {task.title}
        </Text>
        {hasNotes && (
          <View accessible accessibilityLabel="Has notes" style={styles.notesMeta}>
            <IconNote size={13} color={colors.textTertiary} strokeWidth={1.6} />
          </View>
        )}
      </View>
      {(dueLabel || showRest || tagCount > 0) && !task.completed && (
        <View style={styles.metaRow}>
          {showRest && (
            <Text style={[styles.metaMuted, styles.metaRest]} numberOfLines={1}>
              {restParts.join(' · ')}
            </Text>
          )}
          {tagCount > 0 && (
            <View style={styles.tagCount}>
              <IconTag size={12} color={colors.textTertiary} strokeWidth={1.7} />
              <Text style={styles.metaMuted}>{tagCount}</Text>
            </View>
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
      {(dragHandleProps || showHandle) && (
        <View
          style={styles.handle}
          accessibilityLabel={dragHandleProps ? 'Drag to reorder' : undefined}
          {...(dragHandleProps ?? {})}
        >
          <IconGrip />
        </View>
      )}
    </Pressable>
  );

  // Native only. With a mouse the swipe is the same sideways motion as dragging
  // a row somewhere, so the two fight over every gesture, and a pointer reaches
  // Later and Done through the context menu and the checkbox anyway. Phone
  // browsers lose it too: the gesture rides on gesture-handler's native
  // recognizers, and matching that feel against a browser's own scrolling is not
  // worth what the context menu already covers.
  if (selectionMode || task.completed || Platform.OS === 'web') return row;

  return (
    <SwipeableRow onLater={onLater} onDone={onDone}>
      {row}
    </SwipeableRow>
  );
}

/**
 * Web-only, and spread through `as object` so the native typings don't have to know
 * these keys. A row is held to pick it up and reorder it; mobile browsers read that
 * same hold as "select the word under the finger", which lands a selection and a
 * callout bar on top of the drag. (The callout itself is suppressed in
 * public/index.html — it has no style-prop equivalent.)
 */
const noTextSelect = { userSelect: 'none' } as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
    backgroundColor: colors.surface,
    ...(noTextSelect as object),
  },
  /**
   * The grip's width and its offset from the edge (28), plus the same 12 the row
   * puts between everything else. Sized only to the grip, metadata ends exactly
   * where the grip begins and the two read as touching.
   */
  rowHandleGutter: {
    paddingRight: 40,
  },
  rowHovered: {
    backgroundColor: colors.hoverBg,
  },
  rowCompleted: {
    opacity: 0.55,
  },
  titleRow: {
    flex: 1,
    // Guarantees the title never collapses entirely behind long metadata.
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  tagCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  notesMeta: {
    flexShrink: 0,
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
    // Web-only, ignored on native. `touchAction: none` is the important one: a touch
    // that starts on the handle only ever drags, so the browser must hand the whole
    // gesture over instead of scrolling the list with it.
    ...({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as object),
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

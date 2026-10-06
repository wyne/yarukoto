import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  GestureResponderHandlers,
  Platform,
  type PressableStateCallbackType,
  Text,
  View,
} from 'react-native';
import Pressable from './HoverPressable';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { selectionCheckColor } from '../theme/colors';
import { Task, ListDef } from '../data/types';
import { formatDueShort, isOverdue, startOfDay } from '../data/dateUtils';
import TaskCheckbox from './TaskCheckbox';
import SwipeableRow from './SwipeableRow';
import { IconCheckBig, IconGrip, IconNote, IconRepeat, IconStar, IconTag } from '../icons/Icons';

interface Props {
  task: Task;
  list?: ListDef;
  now: Date;
  selectionMode?: boolean;
  selected?: boolean;
  /** Optional semantic tint for the selection ring, fill, and contrasting check. */
  selectionColor?: string;
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
   * Held in the active tint while this is the row being acted on — a context
   * menu, a picker one opened, or the task shown in the detail pane. Moving the
   * pointer away or opening a sheet shouldn't lose track of which task the
   * surrounding UI is about.
   */
  active?: boolean;
  onPress: () => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  onToggleComplete: () => void;
  onToday: () => void;
  onLater: () => void;
  onDone: () => void;
}

type Handlers = Pick<Props, 'onPress' | 'onLongPress' | 'onToggleComplete' | 'onToday' | 'onLater' | 'onDone'>;

/**
 * Every row re-renders whenever its parent does, and the parents re-render on
 * any task change — so without this, editing one task redrew every row on every
 * mounted screen. The parents build their handlers inline and hand over a fresh
 * `now` each render, which would defeat a plain `memo`. This thin wrapper
 * absorbs both: handlers are forwarded through stable functions that call
 * whatever the parent passed last, and `now` only counts when its day does —
 * a row's due label and overdue colour are day-level, and the time it shows is
 * the task's own. Anything finer would redraw every row on the first change
 * after each minute ticked over. The body then skips unless something
 * it draws has actually changed.
 */
export default function TaskRow(props: Props) {
  const latest = useRef<Handlers>(props);
  latest.current = props;
  const stable = useMemo<Required<Handlers>>(
    () => ({
      onPress: () => latest.current.onPress(),
      onLongPress: (e) => latest.current.onLongPress?.(e),
      onToggleComplete: () => latest.current.onToggleComplete(),
      onToday: () => latest.current.onToday(),
      onLater: () => latest.current.onLater(),
      onDone: () => latest.current.onDone(),
    }),
    []
  );
  const { now, ...rest } = props;
  return (
    <TaskRowBody
      {...rest}
      {...stable}
      // Whether there is a long press at all changes how the row behaves, so
      // only its identity is hidden, not its presence.
      onLongPress={props.onLongPress ? stable.onLongPress : undefined}
      today={startOfDay(now).getTime()}
    />
  );
}

type BodyProps = Omit<Props, 'now'> & { today: number };

const TaskRowBody = memo(function TaskRowBody({
  task,
  list,
  today,
  selectionMode,
  selected,
  selectionColor,
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
  onToday,
  onLater,
  onDone,
}: BodyProps) {
  const now = new Date(today);
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const selectedControlColor = selectionColor ?? accent;
  const [releasedActive, setReleasedActive] = useState(false);
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
  const canReleaseActivate = !selectionMode && !selected && !dragSource;

  useEffect(() => {
    setReleasedActive(false);
  }, [active, dragSource, selected, task.id]);

  const press = () => {
    if (!canReleaseActivate) {
      onPress();
      return;
    }
    setReleasedActive(true);
    requestAnimationFrame(onPress);
  };

  const row = (
    <Pressable
      onPress={press}
      onLongPress={onLongPress}
      delayLongPress={350}
      // Released-active is set from onPress, so it waits until the tap resolves
      // but does not wait for the detail context and sheet render to catch up.
      style={(state) => {
        const { hovered } = state as PressState;
        const rowActive = (active || releasedActive) && !selected && !dragSource;
        return [
          styles.row,
          selected && { backgroundColor: colors.selectedRowBg },
          dragSource && { backgroundColor: colors.accentTintBg },
          task.completed && styles.rowCompleted,
          handleGutter && styles.rowHandleGutter,
          rowActive && styles.rowActive,
          hovered && !selected && !dragSource && !rowActive ? styles.rowHovered : null,
        ];
      }}
    >
      {!!list?.color && <View pointerEvents="none" style={[styles.listRail, { backgroundColor: list.color }]} />}
      {selectionMode ? (
        <Pressable onPress={press} hitSlop={10}>
          <View
            style={[
              styles.selectCircle,
              selected
                ? { backgroundColor: selectedControlColor, borderColor: selectedControlColor }
                : { borderColor: selectionColor ?? colors.ringNone },
            ]}
          >
            {selected && (
              <IconCheckBig
                size={11}
                color={selectionColor ? selectionCheckColor(selectionColor) : '#fff'}
                strokeWidth={1.8}
              />
            )}
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
        <View style={[styles.metaRow, leading ? styles.metaRowLeading : null]}>
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
          {dueLabel && !!task.repeat && (
            <View accessible accessibilityLabel="Repeats" style={styles.repeatMeta}>
              <IconRepeat size={12} color={overdue ? colors.priorityHigh : colors.textTertiary} strokeWidth={1.6} />
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
    <SwipeableRow onToday={onToday} onLater={onLater} onDone={onDone}>
      {row}
    </SwipeableRow>
  );
});

/**
 * Web-only, and spread through `as object` so the native typings don't have to know
 * these keys. A row is held to pick it up and reorder it; mobile browsers read that
 * same hold as "select the word under the finger", which lands a selection and a
 * callout bar on top of the drag. (The callout itself is suppressed in
 * public/index.html — it has no style-prop equivalent.)
 */
const noTextSelect = { userSelect: 'none' } as const;
type PressState = PressableStateCallbackType & { hovered?: boolean };

const useStyles = makeStyles((c) => ({
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
    backgroundColor: c.surface,
    ...(noTextSelect as object),
  },
  listRail: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    width: 3,
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
    backgroundColor: c.hoverBg,
  },
  rowActive: {
    backgroundColor: c.selectedRowBg,
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
    fontSize: 16,
    color: c.textPrimary,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: c.textSecondary,
  },
  tagCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  notesMeta: {
    flexShrink: 0,
  },
  repeatMeta: {
    flexShrink: 0,
    marginRight: -5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    // Keeps the row title-first when a task carries a list and several tags.
    maxWidth: '52%',
  },
  /**
   * A leading column — the calendar's due time — is spent before the title gets
   * anything, so the metadata's half of the row is measured against a width that
   * no longer exists. It gives up the difference rather than the title doing it.
   */
  metaRowLeading: {
    maxWidth: '34%',
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
    fontSize: 12,
    color: c.priorityHigh,
  },
  metaMuted: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
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
    backgroundColor: c.chipBg,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: c.textTertiary,
  },
  selectCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

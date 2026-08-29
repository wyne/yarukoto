import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { alpha, priorityColor } from '../../theme/colors';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { addDays, formatTime24to12, isSameDay, toISODate, weekdayShort } from '../../data/dateUtils';
import { Task } from '../../data/types';
import { dayTargetId } from '../../drag/hitTest';
import { useDropTarget } from '../../drag/useDropTarget';
import { useDraggable } from '../../drag/useDraggable';
import { DragPayload, taskIdsFromDrag, useDragActive } from '../../drag/DragContext';
import { useDragSource } from '../../drag/dragSource';

interface Props {
  startDate: Date;
  selectedDate: Date;
  today: Date;
  byDate: Map<string, Task[]>;
  /** How many day columns to show. Defaults to a full week. */
  dayCount?: number;
  onSelectDate: (date: Date) => void;
  onDropTask: (taskIds: string[], iso: string, beforeId?: string | null) => void;
  onOpenTask: (taskId: string) => void;
  /** Custom sorting allows drops to choose a position inside the day. */
  reorderable?: boolean;
  /**
   * How far the grid holds off the bottom of the screen. A column is a bordered
   * box with a header, so unlike a list it can't run under the system tab bar
   * and be read as scrolling beneath it — it just looks cut off.
   */
  bottomInset?: number;
  /**
   * Room under the last chip in a column, for what floats over the grid inside
   * that inset — the task FAB, which otherwise covers the end of a full day.
   */
  bottomClearance?: number;
}

/**
 * Adjacent day columns for the Plan view — seven for a week, or a shorter run for
 * the multi-day view. Same `day:<iso>` drop targets as MonthGrid, so this needed no
 * new drag code — and its columns-per-day shape is what Phase 3's time slots subdivide.
 */
export default function WeekGrid({
  startDate,
  selectedDate,
  today,
  byDate,
  dayCount = 7,
  onSelectDate,
  onDropTask,
  onOpenTask,
  reorderable = false,
  bottomInset = 0,
  bottomClearance = 0,
}: Props) {
  const styles = useStyles();
  const days = Array.from({ length: dayCount }, (_, i) => addDays(startDate, i));

  return (
    <View style={[styles.week, !!bottomInset && { paddingBottom: bottomInset }]}>
      {days.map((date) => (
        <DayColumn
          key={toISODate(date)}
          date={date}
          today={today}
          selectedDate={selectedDate}
          tasks={byDate.get(toISODate(date)) ?? []}
          onSelectDate={onSelectDate}
          onDropTask={onDropTask}
          onOpenTask={onOpenTask}
          reorderable={reorderable}
          bottomClearance={bottomClearance}
          showSelectedBadge={dayCount === 1}
        />
      ))}
    </View>
  );
}

interface ColProps {
  date: Date;
  today: Date;
  selectedDate: Date;
  tasks: Task[];
  onSelectDate: (d: Date) => void;
  onDropTask: (taskIds: string[], iso: string, beforeId?: string | null) => void;
  onOpenTask: (taskId: string) => void;
  reorderable: boolean;
  bottomClearance: number;
  showSelectedBadge: boolean;
}

function DayColumn({
  date,
  today,
  selectedDate,
  tasks,
  onSelectDate,
  onDropTask,
  onOpenTask,
  reorderable,
  bottomClearance,
  showSelectedBadge,
}: ColProps) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const selectedBg = alpha(accent, 0.16);
  const iso = toISODate(date);
  const isToday = isSameDay(date, today);
  const isSelected = showSelectedBadge && isSameDay(date, selectedDate) && !isToday;
  // A task being dragged between columns must not scroll the column it left.
  const dragging = useDragActive();

  const columnTarget = useDropTarget(
    dayTargetId(iso, 'cols'),
    (payload) => onDropTask(taskIdsFromDrag(payload), iso, null),
    !reorderable
  );
  const appendTarget = useDropTarget(
    `cols/day:${iso}:append`,
    (payload) => onDropTask(taskIdsFromDrag(payload), iso, null),
    reorderable
  );

  const dropOnTask = (payload: DragPayload, taskId: string, after: boolean) => {
    const moving = new Set(taskIdsFromDrag(payload));
    const index = tasks.findIndex((task) => task.id === taskId);
    const start = after ? index + 1 : index;
    const beforeId = tasks.slice(start).find((task) => !moving.has(task.id))?.id ?? null;
    onDropTask([...moving], iso, beforeId);
  };

  return (
    <View
      ref={!reorderable ? columnTarget.ref : undefined}
      onLayout={!reorderable ? columnTarget.onLayout : undefined}
      collapsable={false}
      style={[
        styles.col,
        (columnTarget.isOver || (tasks.length === 0 && appendTarget.isOver)) && {
          backgroundColor: colors.accentTintBg,
          borderColor: accent,
        },
      ]}
    >
      <Pressable style={styles.colHeader} onPress={() => onSelectDate(date)}>
        <Text style={styles.colWeekday}>{weekdayShort(date).toUpperCase()}</Text>
        <View
          style={[
            styles.colDayBadge,
            isToday && { backgroundColor: accent },
            isSelected && { backgroundColor: selectedBg },
          ]}
        >
          <Text style={[styles.colDay, isToday && { color: '#fff', fontFamily: fonts.sansSemiBold }]}>
            {date.getDate()}
          </Text>
        </View>
      </Pressable>

      <ScrollView
        style={styles.colScroll}
        contentContainerStyle={[styles.colBody, !!bottomClearance && { paddingBottom: bottomClearance }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragging}
      >
        {tasks.map((task) => (
          <TaskChip
            key={task.id}
            task={task}
            reorderable={reorderable}
            onDropBefore={(payload) => dropOnTask(payload, task.id, false)}
            onDropAfter={(payload) => dropOnTask(payload, task.id, true)}
            onPress={() => onOpenTask(task.id)}
          />
        ))}
        <View
          ref={reorderable ? appendTarget.ref : undefined}
          onLayout={reorderable ? appendTarget.onLayout : undefined}
          collapsable={false}
          style={styles.appendZone}
        >
          {appendTarget.isOver && tasks.length > 0 && (
            <View pointerEvents="none" style={[styles.appendLine, { backgroundColor: accent }]} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Draggable so a task can be moved between days without leaving the week. */
function TaskChip({
  task,
  reorderable,
  onDropBefore,
  onDropAfter,
  onPress,
}: {
  task: Task;
  reorderable: boolean;
  onDropBefore: (payload: DragPayload) => void;
  onDropAfter: (payload: DragPayload) => void;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const { onLongPress, ...handlers } = useDraggable({ taskId: task.id, title: task.title });
  const isSource = useDragSource(task.id);
  const before = useDropTarget(`cols/task:${task.id}:before`, onDropBefore, reorderable);
  const after = useDropTarget(`cols/task:${task.id}:after`, onDropAfter, reorderable);
  const insertion = before.isOver ? 'before' : after.isOver ? 'after' : null;

  return (
    <View style={styles.chipWrap} {...handlers}>
      {reorderable && (
        <>
          <View
            ref={before.ref}
            onLayout={before.onLayout}
            collapsable={false}
            pointerEvents="none"
            style={styles.dropBefore}
          />
          <View
            ref={after.ref}
            onLayout={after.onLayout}
            collapsable={false}
            pointerEvents="none"
            style={styles.dropAfter}
          />
        </>
      )}
      {insertion === 'before' && (
        <View pointerEvents="none" style={[styles.insertLine, styles.insertBefore, { backgroundColor: accent }]} />
      )}
      <Pressable
        style={[
          styles.chip,
          task.completed && styles.chipCompleted,
          isSource && { backgroundColor: colors.accentTintBg, borderColor: accent },
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <View style={[styles.chipDot, { backgroundColor: priorityColor(task.priority, colors) }]} />
        <View style={styles.chipText}>
          <Text style={[styles.chipTitle, task.completed && styles.chipDone]} numberOfLines={2}>
            {task.title}
          </Text>
          {!!task.dueTime && <Text style={styles.chipTime}>{formatTime24to12(task.dueTime)}</Text>}
        </View>
      </Pressable>
      {insertion === 'after' && (
        <View pointerEvents="none" style={[styles.insertLine, styles.insertAfter, { backgroundColor: accent }]} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  week: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  col: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    backgroundColor: c.surface,
    overflow: 'hidden',
  },
  colHeader: {
    alignItems: 'center',
    paddingVertical: 6,
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  colWeekday: {
    fontFamily: fonts.monoRegular,
    fontSize: 9.5,
    letterSpacing: 0.5,
    color: c.textTertiary,
  },
  colDayBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  colDay: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.textPrimary,
  },
  /**
   * Without this the scroller takes its height from the chips in it, so on a
   * light day the column is mostly a plain View and a drag started in the empty
   * part of it — which is most of it — scrolls nothing.
   */
  colScroll: {
    flex: 1,
  },
  colBody: {
    padding: 4,
    // Fills the column even when the chips don't, so the whole of it is content
    // the finger can pull on rather than the top few rows of it.
    flexGrow: 1,
  },
  chipWrap: {
    position: 'relative',
    paddingVertical: 2,
    // Spread as a plain object rather than suppressed line by line: a
    // `@ts-expect-error` inside the builder stops `makeStyles` inferring the
    // sheet's shape at all, and every style name goes missing.
    ...({ userSelect: 'none', cursor: 'grab' } as object),
  },
  dropBefore: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    zIndex: 2,
  },
  dropAfter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    zIndex: 2,
  },
  insertLine: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 2,
    borderRadius: 1,
    zIndex: 3,
  },
  insertBefore: {
    top: 1,
  },
  insertAfter: {
    bottom: 1,
  },
  appendZone: {
    flexGrow: 1,
    minHeight: 28,
    position: 'relative',
  },
  appendLine: {
    position: 'absolute',
    top: 3,
    left: 4,
    right: 4,
    height: 2,
    borderRadius: 1,
  },
  chip: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: 6,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipCompleted: {
    opacity: 0.55,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  chipText: {
    flex: 1,
    minWidth: 0,
  },
  chipTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 15,
    color: c.textPrimary,
  },
  chipDone: {
    textDecorationLine: 'line-through',
    color: c.textTertiary,
  },
  chipTime: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: c.textTertiary,
    marginTop: 2,
  },
}));

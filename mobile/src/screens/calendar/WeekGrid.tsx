import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { priorityColor } from '../../theme/colors';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { addDays, formatTime24to12, isSameDay, toISODate, weekdayShort } from '../../data/dateUtils';
import { Task } from '../../data/types';
import { dayTargetId } from '../../drag/hitTest';
import { useDropTarget } from '../../drag/useDropTarget';
import { useDraggable } from '../../drag/useDraggable';
import { useDrag } from '../../drag/DragContext';
import { useDragSource } from '../../drag/dragSource';

interface Props {
  startDate: Date;
  selectedDate: Date;
  today: Date;
  byDate: Map<string, Task[]>;
  /** How many day columns to show. Defaults to a full week. */
  dayCount?: number;
  onSelectDate: (date: Date) => void;
  onDropTask: (taskId: string, iso: string) => void;
  onOpenTask: (taskId: string) => void;
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
          bottomClearance={bottomClearance}
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
  onDropTask: (taskId: string, iso: string) => void;
  onOpenTask: (taskId: string) => void;
  bottomClearance: number;
}

function DayColumn({
  date,
  today,
  selectedDate,
  tasks,
  onSelectDate,
  onDropTask,
  onOpenTask,
  bottomClearance,
}: ColProps) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const iso = toISODate(date);
  const isToday = isSameDay(date, today);
  const isSelected = isSameDay(date, selectedDate) && !isToday;
  // A task being dragged between columns must not scroll the column it left.
  const { payload } = useDrag();

  const { ref, onLayout, isOver } = useDropTarget(dayTargetId(iso, 'cols'), (payload) => onDropTask(payload.taskId, iso));

  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      style={[styles.col, isOver && { backgroundColor: colors.accentTintBg, borderColor: accent }]}
    >
      <Pressable style={styles.colHeader} onPress={() => onSelectDate(date)}>
        <Text style={styles.colWeekday}>{weekdayShort(date).toUpperCase()}</Text>
        <View
          style={[
            styles.colDayBadge,
            isToday && { backgroundColor: accent },
            isSelected && { backgroundColor: colors.chipBg },
          ]}
        >
          <Text style={[styles.colDay, isToday && { color: '#fff', fontFamily: fonts.sansSemiBold }]}>
            {date.getDate()}
          </Text>
        </View>
      </Pressable>

      <ScrollView
        contentContainerStyle={[styles.colBody, !!bottomClearance && { paddingBottom: bottomClearance }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!payload}
      >
        {tasks.map((task) => (
          <TaskChip key={task.id} task={task} onPress={() => onOpenTask(task.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Draggable so a task can be moved between days without leaving the week. */
function TaskChip({ task, onPress }: { task: Task; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const { onLongPress, ...handlers } = useDraggable({ taskId: task.id, title: task.title });
  const isSource = useDragSource(task.id);

  return (
    <View style={styles.chipWrap} {...handlers}>
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
  colBody: {
    padding: 4,
    gap: 4,
  },
  chipWrap: {
    // Spread as a plain object rather than suppressed line by line: a
    // `@ts-expect-error` inside the builder stops `makeStyles` inferring the
    // sheet's shape at all, and every style name goes missing.
    ...({ userSelect: 'none', cursor: 'grab' } as object),
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

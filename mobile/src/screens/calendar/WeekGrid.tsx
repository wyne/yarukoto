import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, priorityColor } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { addDays, formatTime24to12, isSameDay, toISODate, weekdayShort } from '../../data/dateUtils';
import { Task } from '../../data/types';
import { dayTargetId } from '../../drag/hitTest';
import { useDropTarget } from '../../drag/useDropTarget';
import { useDraggable } from '../../drag/useDraggable';

interface Props {
  weekStart: Date;
  selectedDate: Date;
  today: Date;
  byDate: Map<string, Task[]>;
  onSelectDate: (date: Date) => void;
  onDropTask: (taskId: string, iso: string) => void;
  onOpenTask: (taskId: string) => void;
}

/**
 * Seven day columns for the Plan view. Same `day:<iso>` drop targets as MonthGrid,
 * so this needed no new drag code — and its columns-per-day shape is what Phase 3's
 * time slots subdivide.
 */
export default function WeekGrid({
  weekStart,
  selectedDate,
  today,
  byDate,
  onSelectDate,
  onDropTask,
  onOpenTask,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <View style={styles.week}>
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
}

function DayColumn({ date, today, selectedDate, tasks, onSelectDate, onDropTask, onOpenTask }: ColProps) {
  const accent = useAccent();
  const iso = toISODate(date);
  const isToday = isSameDay(date, today);
  const isSelected = isSameDay(date, selectedDate) && !isToday;

  const { ref, onLayout, isOver } = useDropTarget(dayTargetId(iso), (payload) => onDropTask(payload.taskId, iso));

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

      <ScrollView contentContainerStyle={styles.colBody} showsVerticalScrollIndicator={false}>
        {tasks.map((task) => (
          <TaskChip key={task.id} task={task} onPress={() => onOpenTask(task.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Draggable so a task can be moved between days without leaving the week. */
function TaskChip({ task, onPress }: { task: Task; onPress: () => void }) {
  const handlers = useDraggable({ taskId: task.id, title: task.title });

  return (
    <View style={styles.chipWrap} {...handlers}>
      <Pressable style={styles.chip} onPress={onPress}>
        <View style={[styles.chipDot, { backgroundColor: priorityColor(task.priority) }]} />
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

const styles = StyleSheet.create({
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
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  colHeader: {
    alignItems: 'center',
    paddingVertical: 6,
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  colWeekday: {
    fontFamily: fonts.monoRegular,
    fontSize: 9.5,
    letterSpacing: 0.5,
    color: colors.textTertiary,
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
    color: colors.textPrimary,
  },
  colBody: {
    padding: 4,
    gap: 4,
  },
  chipWrap: {
    userSelect: 'none',
    // @ts-expect-error web-only affordance; ignored on native
    cursor: 'grab',
  },
  chip: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textPrimary,
  },
  chipDone: {
    textDecorationLine: 'line-through',
    color: colors.textTertiary,
  },
  chipTime: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
  },
});

import React from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
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

const INSERT_GAP = 6;
const INSERT_LINE_HEIGHT = 2;

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
  /** Completed tasks are forced below active tasks, so their insertion slots are separate. */
  draggingCompleted?: boolean;
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
  draggingCompleted = false,
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
          draggingCompleted={draggingCompleted}
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
  draggingCompleted: boolean;
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
  draggingCompleted,
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
  const [chipLayouts, setChipLayouts] = React.useState<Record<string, ChipLayout>>({});

  React.useEffect(() => {
    const ids = new Set(tasks.map((task) => task.id));
    setChipLayouts((prev) => {
      const next: Record<string, ChipLayout> = {};
      let changed = false;
      for (const id of ids) {
        const layout = prev[id];
        if (layout) next[id] = layout;
      }
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      return changed ? next : prev;
    });
  }, [tasks]);

  const columnTarget = useDropTarget(
    dayTargetId(iso, 'cols'),
    (payload) => onDropTask(taskIdsFromDrag(payload), iso, null),
    !reorderable
  );

  const dropIntoSlot = (payload: DragPayload, beforeId: string | null) => {
    const moving = new Set(taskIdsFromDrag(payload));
    if (!beforeId) {
      onDropTask([...moving], iso, null);
      return;
    }
    const index = tasks.findIndex((task) => task.id === beforeId);
    const normalizedBeforeId =
      index !== -1 && !moving.has(beforeId)
        ? beforeId
        : tasks.slice(Math.max(0, index + 1)).find((task) => !moving.has(task.id))?.id ?? null;
    onDropTask([...moving], iso, normalizedBeforeId);
  };

  const rememberChipLayout = React.useCallback((taskId: string, event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setChipLayouts((prev) => {
      const current = prev[taskId];
      if (current && Math.abs(current.y - y) < 0.5 && Math.abs(current.height - height) < 0.5) return prev;
      return { ...prev, [taskId]: { y, height } };
    });
  }, []);
  const insertStops = React.useMemo(
    () => buildInsertStops(iso, tasks, chipLayouts, draggingCompleted),
    [iso, tasks, chipLayouts, draggingCompleted]
  );

  return (
    <View
      ref={!reorderable ? columnTarget.ref : undefined}
      onLayout={!reorderable ? columnTarget.onLayout : undefined}
      collapsable={false}
      style={[
        styles.col,
        columnTarget.isOver && {
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
        <View style={styles.chipsLayer}>
          {tasks.map((task) => (
            <TaskChip
              key={task.id}
              task={task}
              onLayout={(event) => rememberChipLayout(task.id, event)}
              onPress={() => onOpenTask(task.id)}
            />
          ))}
          {reorderable &&
            insertStops.map((stop, index) => {
              const bounds = insertBounds(insertStops, index);
              return (
                <InsertBoundary
                  key={stop.id}
                  id={stop.id}
                  top={bounds.top}
                  height={bounds.height}
                  bottom={bounds.bottom}
                  lineTop={stop.lineTop - bounds.top}
                  onDrop={(payload) => dropIntoSlot(payload, stop.beforeId)}
                />
              );
            })}
        </View>
      </ScrollView>
    </View>
  );
}

interface ChipLayout {
  y: number;
  height: number;
}

interface InsertStop {
  id: string;
  beforeId: string | null;
  lineTop: number;
}

function lineBefore(layout: ChipLayout): number {
  return Math.max(0, layout.y - INSERT_GAP / 2 - INSERT_LINE_HEIGHT / 2);
}

function lineAfter(layout: ChipLayout): number {
  return layout.y + layout.height + INSERT_GAP / 2 - INSERT_LINE_HEIGHT / 2;
}

function buildInsertStops(
  iso: string,
  tasks: Task[],
  layouts: Record<string, ChipLayout>,
  draggingCompleted: boolean
): InsertStop[] {
  const bucketTasks = tasks.filter((task) => task.completed === draggingCompleted);
  const stops = bucketTasks.flatMap((task): InsertStop[] => {
    const layout = layouts[task.id];
    return layout
      ? [{ id: `cols/day:${iso}/before:${task.id}`, beforeId: task.id, lineTop: lineBefore(layout) }]
      : [];
  });
  const firstCompleted = tasks.find((task) => task.completed);
  const lastInBucket = bucketTasks[bucketTasks.length - 1];
  const lastTask = tasks[tasks.length - 1];
  const terminalLayout = draggingCompleted
    ? layouts[lastInBucket?.id ?? lastTask?.id ?? '']
    : firstCompleted
      ? layouts[firstCompleted.id]
      : layouts[lastInBucket?.id ?? ''];

  if (tasks.length === 0) {
    stops.push({ id: `cols/day:${iso}/append`, beforeId: null, lineTop: INSERT_GAP / 2 - INSERT_LINE_HEIGHT / 2 });
  } else if (draggingCompleted) {
    if (terminalLayout) {
      stops.push({ id: `cols/day:${iso}/append`, beforeId: null, lineTop: lineAfter(terminalLayout) });
    }
  } else if (firstCompleted) {
    if (terminalLayout) {
      stops.push({
        id: `cols/day:${iso}/append-active`,
        beforeId: firstCompleted.id,
        lineTop: lineBefore(terminalLayout),
      });
    }
  } else if (terminalLayout) {
    stops.push({ id: `cols/day:${iso}/append`, beforeId: null, lineTop: lineAfter(terminalLayout) });
  }

  return stops.sort((a, b) => a.lineTop - b.lineTop);
}

function insertBounds(stops: InsertStop[], index: number): { top: number; height?: number; bottom?: number } {
  const center = stops[index].lineTop + INSERT_LINE_HEIGHT / 2;
  const prev = stops[index - 1]?.lineTop;
  const next = stops[index + 1]?.lineTop;
  const top = prev === undefined ? 0 : (prev + INSERT_LINE_HEIGHT / 2 + center) / 2;
  if (next === undefined) return { top, bottom: 0 };
  const bottom = (center + next + INSERT_LINE_HEIGHT / 2) / 2;
  return { top, height: Math.max(1, bottom - top) };
}

/** Draggable so a task can be moved between days without leaving the week. */
function TaskChip({
  task,
  onLayout,
  onPress,
}: {
  task: Task;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const { onLongPress, ...handlers } = useDraggable({ taskId: task.id, title: task.title });
  const isSource = useDragSource(task.id);

  return (
    <View
      onLayout={onLayout}
      collapsable={false}
      style={styles.chipWrap}
      {...handlers}
    >
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

function InsertBoundary({
  id,
  top,
  height,
  bottom,
  lineTop,
  onDrop,
}: {
  id: string;
  top: number;
  height?: number;
  bottom?: number;
  lineTop: number;
  onDrop: (payload: DragPayload) => void;
}) {
  const styles = useStyles();
  const accent = useAccent();
  const { ref, onLayout, isOver } = useDropTarget(id, onDrop, true);

  return (
    <View
      ref={ref}
      onLayout={onLayout}
      pointerEvents="none"
      collapsable={false}
      style={[styles.insertBoundary, height === undefined ? { top, bottom: bottom ?? 0 } : { top, height }]}
    >
      {isOver && (
        <View
          pointerEvents="none"
          style={[styles.insertLine, { top: Math.max(0, lineTop), backgroundColor: accent }]}
        />
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
  chipsLayer: {
    flexGrow: 1,
    position: 'relative',
    paddingBottom: INSERT_GAP,
  },
  chipWrap: {
    position: 'relative',
    marginTop: INSERT_GAP,
    // Spread as a plain object rather than suppressed line by line: a
    // `@ts-expect-error` inside the builder stops `makeStyles` inferring the
    // sheet's shape at all, and every style name goes missing.
    ...({ userSelect: 'none', cursor: 'grab' } as object),
  },
  insertBoundary: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
  },
  insertLine: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: INSERT_LINE_HEIGHT,
    borderRadius: INSERT_LINE_HEIGHT / 2,
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

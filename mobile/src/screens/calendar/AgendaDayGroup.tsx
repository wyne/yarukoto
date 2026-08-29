import React from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { monthShort, toISODate, weekdayShort } from '../../data/dateUtils';
import { Task } from '../../data/types';
import Card from '../../components/Card';
import Divider from '../../components/Divider';
import AgendaRow from './AgendaRow';
import { dayTargetId } from '../../drag/hitTest';
import { DragPayload, taskIdsFromDrag, useDragOverDay } from '../../drag/DragContext';
import { Measurable, useDropTarget } from '../../drag/useDropTarget';

interface Props {
  date: Date;
  tasks: Task[];
  now: Date;
  onOpenTask: (taskId: string) => void;
  /** Plan only. Makes the whole group a drop target and its rows draggable. */
  onDropTask?: (taskIds: string[], iso: string, beforeId?: string | null) => void;
  /** Custom sorting allows drops to choose a position inside the day. */
  reorderable?: boolean;
  /** Completed tasks are forced below active tasks, so their insertion slots are separate. */
  draggingCompleted?: boolean;
  /**
   * Only the part of the group inside this frame accepts drops. The agenda
   * scrolls under the month grid, so without a clip scrolled-off groups would
   * keep intercepting drops meant for the calendar above.
   */
  clipTo?: React.RefObject<Measurable | null> | null;
}

/**
 * One day's worth of agenda entries. In Plan the group itself accepts drops, so a
 * task can be moved onto a day by aiming at the list it belongs in rather than
 * having to hit a 30px cell in the month grid above.
 */
export default function AgendaDayGroup({
  date,
  tasks,
  now,
  onOpenTask,
  onDropTask,
  reorderable = false,
  draggingCompleted = false,
  clipTo,
}: Props) {
  const styles = useStyles();
  const accent = useAccent();
  const iso = toISODate(date);
  const droppable = !!onDropTask;
  // The group, not the slot, is what says *where* a task is headed: with granular
  // placement the hovered target is an insertion line inside the group, so ask
  // about the day rather than about this View's own drop target.
  const isDropDay = useDragOverDay(iso, 'agenda');
  const [rowLayouts, setRowLayouts] = React.useState<Record<string, RowLayout>>({});

  React.useEffect(() => {
    const ids = new Set(tasks.map((task) => task.id));
    setRowLayouts((prev) => {
      const next: Record<string, RowLayout> = {};
      let changed = false;
      for (const id of ids) {
        const layout = prev[id];
        if (layout) next[id] = layout;
      }
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      return changed ? next : prev;
    });
  }, [tasks]);

  const { ref, onLayout } = useDropTarget(
    dayTargetId(iso, 'agenda'),
    (payload) => onDropTask?.(taskIdsFromDrag(payload), iso),
    droppable && !reorderable,
    clipTo
  );

  const dropAt = React.useCallback(
    (payload: DragPayload, beforeId: string | null) => {
      const moving = new Set(taskIdsFromDrag(payload));
      if (!beforeId) {
        onDropTask?.([...moving], iso, null);
        return;
      }
      const index = tasks.findIndex((task) => task.id === beforeId);
      const normalizedBeforeId =
        index !== -1 && !moving.has(beforeId)
          ? beforeId
          : tasks.slice(Math.max(0, index + 1)).find((task) => !moving.has(task.id))?.id ?? null;
      onDropTask?.([...moving], iso, normalizedBeforeId);
    },
    [iso, onDropTask, tasks]
  );

  const rememberRowLayout = React.useCallback((taskId: string, event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setRowLayouts((prev) => {
      const current = prev[taskId];
      if (current && Math.abs(current.y - y) < 0.5 && Math.abs(current.height - height) < 0.5) return prev;
      return { ...prev, [taskId]: { y, height } };
    });
  }, []);

  const insertStops = React.useMemo(
    () => buildInsertStops(iso, tasks, rowLayouts, draggingCompleted),
    [iso, tasks, rowLayouts, draggingCompleted]
  );

  return (
    <View
      ref={droppable && !reorderable ? ref : undefined}
      onLayout={droppable && !reorderable ? onLayout : undefined}
      collapsable={false}
      style={[
        styles.group,
        droppable && isDropDay && styles.groupOver,
        droppable && isDropDay && { borderColor: accent },
      ]}
    >
      <Text style={[styles.header, droppable && isDropDay && { color: accent }]}>
        {weekdayShort(date)}, {monthShort(date)} {date.getDate()} · {tasks.length} task
        {tasks.length === 1 ? '' : 's'}
      </Text>
      <Card>
        <View style={styles.rowsLayer}>
          {tasks.map((task, i) => (
            <View key={task.id} onLayout={(event) => rememberRowLayout(task.id, event)} collapsable={false}>
              <AgendaRow task={task} now={now} draggable={droppable} onPress={() => onOpenTask(task.id)} />
              {i < tasks.length - 1 && <Divider indent={90} />}
            </View>
          ))}
          {droppable &&
            reorderable &&
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
                  clipTo={clipTo}
                  onDrop={(payload) => dropAt(payload, stop.beforeId)}
                />
              );
            })}
        </View>
      </Card>
    </View>
  );
}

interface RowLayout {
  y: number;
  height: number;
}

interface InsertStop {
  id: string;
  beforeId: string | null;
  lineTop: number;
}

const INSERT_LINE_HEIGHT = 2;

function lineBefore(layout: RowLayout): number {
  return Math.max(0, layout.y - INSERT_LINE_HEIGHT / 2);
}

function lineAfter(layout: RowLayout): number {
  return layout.y + layout.height - INSERT_LINE_HEIGHT / 2;
}

function buildInsertStops(
  iso: string,
  tasks: Task[],
  layouts: Record<string, RowLayout>,
  draggingCompleted: boolean
): InsertStop[] {
  const bucketTasks = tasks.filter((task) => task.completed === draggingCompleted);
  const stops = bucketTasks.flatMap((task): InsertStop[] => {
    const layout = layouts[task.id];
    return layout
      ? [{ id: `agenda/day:${iso}/before:${task.id}`, beforeId: task.id, lineTop: lineBefore(layout) }]
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
    stops.push({ id: `agenda/day:${iso}/append`, beforeId: null, lineTop: 0 });
  } else if (draggingCompleted) {
    if (terminalLayout) {
      stops.push({ id: `agenda/day:${iso}/append`, beforeId: null, lineTop: lineAfter(terminalLayout) });
    }
  } else if (firstCompleted) {
    if (terminalLayout) {
      stops.push({
        id: `agenda/day:${iso}/append-active`,
        beforeId: firstCompleted.id,
        lineTop: lineBefore(terminalLayout),
      });
    }
  } else if (terminalLayout) {
    stops.push({ id: `agenda/day:${iso}/append`, beforeId: null, lineTop: lineAfter(terminalLayout) });
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

function InsertBoundary({
  id,
  top,
  height,
  bottom,
  lineTop,
  clipTo,
  onDrop,
}: {
  id: string;
  top: number;
  height?: number;
  bottom?: number;
  lineTop: number;
  clipTo?: React.RefObject<Measurable | null> | null;
  onDrop: (payload: DragPayload) => void;
}) {
  const styles = useStyles();
  const accent = useAccent();
  const { ref, onLayout, isOver } = useDropTarget(id, onDrop, true, clipTo);

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
  group: {
    // Transparent border reserved so hovering doesn't shift the layout.
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    padding: 2,
  },
  groupOver: {
    backgroundColor: c.accentTintBg,
  },
  header: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
    paddingHorizontal: 6,
    paddingBottom: 8,
    paddingTop: 6,
  },
  rowsLayer: {
    position: 'relative',
  },
  insertBoundary: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
  },
  insertLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: INSERT_LINE_HEIGHT,
    borderRadius: INSERT_LINE_HEIGHT / 2,
  },
}));

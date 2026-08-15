import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';
import { getListById } from '../../data/selectors';
import { formatTime24to12 } from '../../data/dateUtils';
import { Task } from '../../data/types';
import TaskRow from '../../components/TaskRow';
import { useDraggable } from '../../drag/useDraggable';

interface Props {
  task: Task;
  now: Date;
  onPress: () => void;
  /** Plan only: the calendar surfaces are drop targets there, so rows can be moved. */
  draggable?: boolean;
}

/**
 * A calendar agenda entry, rendered with the same TaskRow the list views use so
 * metadata sits right-aligned on one line rather than wrapping to a second.
 *
 * The due date is suppressed — the day heading above already states it — and the
 * time takes its place on the left.
 */
export default function AgendaRow({ task, now, onPress, draggable }: Props) {
  const { state, toggleComplete, snoozeTask } = useTasks();
  const { onLongPress, ...handlers } = useDraggable({ taskId: task.id, title: task.title });

  const row = (
    <TaskRow
      task={task}
      list={getListById(state.lists, task.listId)}
      now={now}
      hideDue
      showHandle={draggable}
      leading={
        <Text style={styles.time}>{task.dueTime ? formatTime24to12(task.dueTime) : 'All day'}</Text>
      }
      onPress={onPress}
      onLongPress={onLongPress}
      onToggleComplete={() => toggleComplete(task.id)}
      onLater={() => snoozeTask(task.id)}
      onDone={() => toggleComplete(task.id)}
    />
  );

  if (!draggable) return row;

  return (
    <View style={styles.draggable} {...handlers}>
      {row}
    </View>
  );
}

const styles = StyleSheet.create({
  time: {
    width: 62,
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.textTertiary,
  },
  draggable: {
    userSelect: 'none',
    // @ts-expect-error web-only affordance; ignored on native
    cursor: 'grab',
  },
});

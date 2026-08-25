import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { monthShort, toISODate, weekdayShort } from '../../data/dateUtils';
import { Task } from '../../data/types';
import Card from '../../components/Card';
import Divider from '../../components/Divider';
import AgendaRow from './AgendaRow';
import { dayTargetId } from '../../drag/hitTest';
import { Measurable, useDropTarget } from '../../drag/useDropTarget';

interface Props {
  date: Date;
  tasks: Task[];
  now: Date;
  onOpenTask: (taskId: string) => void;
  /** Plan only. Makes the whole group a drop target and its rows draggable. */
  onDropTask?: (taskId: string, iso: string) => void;
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
export default function AgendaDayGroup({ date, tasks, now, onOpenTask, onDropTask, clipTo }: Props) {
  const accent = useAccent();
  const iso = toISODate(date);
  const droppable = !!onDropTask;

  const { ref, onLayout, isOver } = useDropTarget(
    dayTargetId(iso, 'agenda'),
    (payload) => onDropTask?.(payload.taskId, iso),
    droppable,
    clipTo
  );

  return (
    <View
      ref={droppable ? ref : undefined}
      onLayout={droppable ? onLayout : undefined}
      collapsable={false}
      style={[styles.group, droppable && isOver && styles.groupOver, droppable && isOver && { borderColor: accent }]}
    >
      <Text style={[styles.header, droppable && isOver && { color: accent }]}>
        {weekdayShort(date)}, {monthShort(date)} {date.getDate()} · {tasks.length} task
        {tasks.length === 1 ? '' : 's'}
      </Text>
      <Card>
        {tasks.map((task, i) => (
          <View key={task.id}>
            <AgendaRow task={task} now={now} draggable={droppable} onPress={() => onOpenTask(task.id)} />
            {i < tasks.length - 1 && <Divider indent={90} />}
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    // Transparent border reserved so hovering doesn't shift the layout.
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    padding: 2,
  },
  groupOver: {
    backgroundColor: colors.accentTintBg,
  },
  header: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    paddingHorizontal: 6,
    paddingBottom: 8,
    paddingTop: 6,
  },
});

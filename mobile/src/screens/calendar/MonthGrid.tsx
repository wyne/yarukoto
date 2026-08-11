import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, priorityColor } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { buildMonthGrid, isSameDay, toISODate } from '../../data/dateUtils';
import { Task } from '../../data/types';
import Card from '../../components/Card';
import { dayTargetId } from '../../drag/hitTest';
import { useDropTarget } from '../../drag/useDropTarget';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function priorityWeight(p: Task['priority']): number {
  return { high: 3, medium: 2, low: 1, none: 0 }[p];
}

interface Props {
  monthAnchor: Date;
  selectedDate: Date;
  today: Date;
  byDate: Map<string, Task[]>;
  onSelectDate: (date: Date) => void;
  onChangeMonth: (date: Date) => void;
  /** Plan view only: makes every day cell a drop target for scheduling. */
  onDropTask?: (taskId: string, iso: string) => void;
}

export default function MonthGrid({
  monthAnchor,
  selectedDate,
  today,
  byDate,
  onSelectDate,
  onChangeMonth,
  onDropTask,
}: Props) {
  const grid = React.useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);

  const dotColorFor = (iso: string): string | null => {
    const dayTasks = byDate.get(iso);
    if (!dayTasks || dayTasks.length === 0) return null;
    const top = dayTasks.reduce((best, t) => (priorityWeight(t.priority) > priorityWeight(best.priority) ? t : best));
    return top.priority === 'none' ? colors.textTertiary : priorityColor(top.priority);
  };

  return (
    <Card style={styles.gridCard}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <Text key={i} style={styles.weekdayLetter}>
            {l}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {grid.map(({ date, inMonth }) => (
          <DayCell
            key={toISODate(date)}
            date={date}
            inMonth={inMonth}
            today={today}
            selectedDate={selectedDate}
            dot={dotColorFor(toISODate(date))}
            onSelectDate={onSelectDate}
            onChangeMonth={onChangeMonth}
            onDropTask={onDropTask}
          />
        ))}
      </View>
    </Card>
  );
}

interface CellProps {
  date: Date;
  inMonth: boolean;
  today: Date;
  selectedDate: Date;
  dot: string | null;
  onSelectDate: (d: Date) => void;
  onChangeMonth: (d: Date) => void;
  onDropTask?: (taskId: string, iso: string) => void;
}

function DayCell({ date, inMonth, today, selectedDate, dot, onSelectDate, onChangeMonth, onDropTask }: CellProps) {
  const accent = useAccent();
  const iso = toISODate(date);
  const isToday = isSameDay(date, today);
  const isSelected = isSameDay(date, selectedDate) && !isToday;

  const { ref, onLayout, isOver } = useDropTarget(dayTargetId(iso), (payload) => onDropTask?.(payload.taskId, iso));

  return (
    <View
      style={styles.cell}
      // Only measured and registered when the grid is droppable.
      ref={onDropTask ? ref : undefined}
      onLayout={onDropTask ? onLayout : undefined}
      collapsable={false}
    >
      <Pressable
        onPress={() => {
          onSelectDate(date);
          if (!inMonth) onChangeMonth(new Date(date.getFullYear(), date.getMonth(), 1));
        }}
      >
        <View
          style={[
            styles.cellInner,
            isToday && { backgroundColor: accent },
            isSelected && { backgroundColor: colors.chipBg },
            !!onDropTask && isOver && { borderWidth: 2, borderColor: accent, backgroundColor: colors.accentTintBg },
          ]}
        >
          <Text
            style={[
              styles.cellText,
              !inMonth && { color: colors.textFaint },
              isToday && { color: '#fff', fontFamily: fonts.sansSemiBold },
            ]}
          >
            {date.getDate()}
          </Text>
          {dot && !isToday && <View style={[styles.dot, { backgroundColor: dot }]} />}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  gridCard: {
    padding: 8,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLetter: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.textTertiary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 2,
  },
  cellInner: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  dot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

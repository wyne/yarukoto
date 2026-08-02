import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, priorityColor } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useTasks } from '../data/TaskContext';
import { getListById, tasksByDate } from '../data/selectors';
import {
  addDays,
  addMonths,
  buildMonthGrid,
  formatTime24to12,
  isSameDay,
  monthShort,
  toISODate,
  weekdayShort,
} from '../data/dateUtils';
import { Task } from '../data/types';
import Card from '../components/Card';
import Divider from '../components/Divider';
import TaskCheckbox from '../components/TaskCheckbox';
import { IconChevronLeft, IconChevronRight } from '../icons/Icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const AGENDA_WINDOW_DAYS = 45;

function priorityWeight(p: Task['priority']): number {
  return { high: 3, medium: 2, low: 1, none: 0 }[p];
}

export default function CalendarScreen() {
  const navigation = useNavigation<Nav>();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { state, toggleComplete } = useTasks();
  const today = new Date();

  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);

  const byDate = useMemo(() => tasksByDate(state.tasks), [state.tasks]);
  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);

  const dotColorFor = (iso: string): string | null => {
    const dayTasks = byDate.get(iso);
    if (!dayTasks || dayTasks.length === 0) return null;
    const top = dayTasks.reduce((best, t) => (priorityWeight(t.priority) > priorityWeight(best.priority) ? t : best));
    return top.priority === 'none' ? colors.textTertiary : priorityColor(top.priority);
  };

  const goToday = () => {
    setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  const agendaDays = useMemo(() => {
    const out: { date: Date; tasks: Task[] }[] = [];
    for (let i = 0; i < AGENDA_WINDOW_DAYS && out.length < 12; i++) {
      const d = addDays(selectedDate, i);
      const tasks = byDate.get(toISODate(d));
      if (tasks && tasks.length) out.push({ date: d, tasks });
    }
    return out;
  }, [selectedDate, byDate]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => setMonthAnchor((m) => addMonths(m, -1))} hitSlop={8}>
          <IconChevronLeft />
        </Pressable>
        <Text style={styles.title}>
          {monthAnchor.toLocaleDateString('en-US', { month: 'long' })}{' '}
          <Text style={styles.titleYear}>{monthAnchor.getFullYear()}</Text>
        </Text>
        <Pressable onPress={() => setMonthAnchor((m) => addMonths(m, 1))} hitSlop={8}>
          <IconChevronRight />
        </Pressable>
        <Pressable style={[styles.todayBtn, { borderColor: colors.border }]} onPress={goToday}>
          <Text style={[styles.todayBtnText, { color: accent }]}>Today</Text>
        </Pressable>
      </View>

      <View style={styles.gridCardWrap}>
        <Card style={styles.gridCard}>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LETTERS.map((l, i) => (
              <Text key={i} style={styles.weekdayLetter}>
                {l}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {grid.map(({ date, inMonth }) => {
              const iso = toISODate(date);
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, selectedDate) && !isToday;
              const dot = dotColorFor(iso);
              return (
                <Pressable
                  key={iso}
                  style={styles.cell}
                  onPress={() => {
                    setSelectedDate(date);
                    if (!inMonth) setMonthAnchor(new Date(date.getFullYear(), date.getMonth(), 1));
                  }}
                >
                  <View
                    style={[
                      styles.cellInner,
                      isToday && { backgroundColor: accent },
                      isSelected && { backgroundColor: colors.chipBg },
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
              );
            })}
          </View>
        </Card>
      </View>

      <ScrollView contentContainerStyle={styles.agenda}>
        {agendaDays.length === 0 && (
          <Text style={styles.empty}>Nothing scheduled in the next {AGENDA_WINDOW_DAYS} days.</Text>
        )}
        {agendaDays.map(({ date, tasks }) => (
          <View key={toISODate(date)}>
            <Text style={styles.agendaHeader}>
              {weekdayShort(date)}, {monthShort(date)} {date.getDate()} · {tasks.length} task{tasks.length === 1 ? '' : 's'}
            </Text>
            <Card>
              {tasks.map((task, i) => {
                const list = getListById(state.lists, task.listId);
                const tagsStr = task.tags.length ? task.tags.map((t) => `#${t}`).join(' ') : null;
                const meta = [list?.name, tagsStr].filter(Boolean).join(' · ');
                return (
                  <View key={task.id}>
                    <Pressable
                      style={styles.taskRow}
                      onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                    >
                      <Text style={styles.timeLabel}>{task.dueTime ? formatTime24to12(task.dueTime) : 'All day'}</Text>
                      <TaskCheckbox completed={task.completed} priority={task.priority} onPress={() => toggleComplete(task.id)} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.taskTitle, task.completed && styles.taskTitleDone]} numberOfLines={1}>
                          {task.title}
                        </Text>
                        {!!meta && (
                          <Text style={styles.taskMeta} numberOfLines={1}>
                            {meta}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                    {i < tasks.length - 1 && <Divider indent={90} />}
                  </View>
                );
              })}
            </Card>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  titleYear: {
    fontFamily: fonts.sansRegular,
    color: colors.textTertiary,
  },
  todayBtn: {
    marginLeft: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  todayBtnText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
  },
  gridCardWrap: {
    paddingHorizontal: 12,
  },
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
  agenda: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
  },
  agendaHeader: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    paddingHorizontal: 6,
    paddingBottom: 8,
    paddingTop: 6,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
  },
  timeLabel: {
    width: 62,
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.textTertiary,
  },
  taskTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.textTertiary,
  },
  taskMeta: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: colors.textTertiary,
    marginTop: 2,
  },
});

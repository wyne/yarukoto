import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { MainTabParamList } from '../navigation/types';
import { useSidebar } from '../navigation/SidebarContext';
import { useDetail } from '../navigation/DetailContext';
import { useTasks } from '../data/TaskContext';
import { getListById, tasksByDate } from '../data/selectors';
import { addDays, addMonths, formatTime24to12, monthShort, toISODate, weekdayShort } from '../data/dateUtils';
import { Task } from '../data/types';
import Card from '../components/Card';
import Divider from '../components/Divider';
import TaskCheckbox from '../components/TaskCheckbox';
import MonthGrid from './calendar/MonthGrid';
import SchedulePane from './calendar/SchedulePane';

const AGENDA_WINDOW_DAYS = 45;

type Props = BottomTabScreenProps<MainTabParamList, 'PlanTab'>;

/**
 * Desktop planning surface: a scoped task list beside a calendar, drag a task onto
 * a day to schedule it. Wide layouts only — Calendar remains the narrow-screen view.
 */
export default function PlanScreen({ navigation }: Props) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { wide } = useSidebar();
  const { openTask } = useDetail();
  const { state, updateTask, toggleComplete } = useTasks();
  const today = new Date();

  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);

  // Two panes can't survive a phone-width window; Calendar is the equivalent there.
  useEffect(() => {
    if (!wide) navigation.navigate('CalendarTab');
  }, [wide, navigation]);

  const byDate = useMemo(() => tasksByDate(state.tasks), [state.tasks]);

  const agendaDays = useMemo(() => {
    const out: { date: Date; tasks: Task[] }[] = [];
    for (let i = 0; i < AGENDA_WINDOW_DAYS && out.length < 12; i++) {
      const d = addDays(selectedDate, i);
      const tasks = byDate.get(toISODate(d));
      if (tasks && tasks.length) out.push({ date: d, tasks });
    }
    return out;
  }, [selectedDate, byDate]);

  // Scheduling only sets the date — an existing time of day is left alone, and the
  // day you're looking at stays put rather than following the drop.
  const scheduleTask = (taskId: string, iso: string) => {
    updateTask(taskId, { dueDate: iso });
  };

  if (!wide) return <View style={styles.screen} />;

  return (
    <View style={[styles.row, { paddingTop: insets.top + 6 }]}>
      <SchedulePane />

      <View style={styles.calendarCol}>
        <View style={styles.header}>
          <Pressable onPress={() => setMonthAnchor((m) => addMonths(m, -1))} hitSlop={8}>
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <Text style={styles.title}>
            {monthAnchor.toLocaleDateString('en-US', { month: 'long' })}{' '}
            <Text style={styles.titleYear}>{monthAnchor.getFullYear()}</Text>
          </Text>
          <Pressable onPress={() => setMonthAnchor((m) => addMonths(m, 1))} hitSlop={8}>
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
          <Pressable
            style={[styles.todayBtn, { borderColor: colors.border }]}
            onPress={() => {
              setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelectedDate(today);
            }}
          >
            <Text style={[styles.todayBtnText, { color: accent }]}>Today</Text>
          </Pressable>
        </View>

        <View style={styles.gridWrap}>
          <MonthGrid
            monthAnchor={monthAnchor}
            selectedDate={selectedDate}
            today={today}
            byDate={byDate}
            onSelectDate={setSelectedDate}
            onChangeMonth={setMonthAnchor}
            onDropTask={scheduleTask}
          />
        </View>

        <ScrollView contentContainerStyle={styles.agenda}>
          {agendaDays.length === 0 && <Text style={styles.empty}>Nothing scheduled from here on.</Text>}
          {agendaDays.map(({ date, tasks }) => (
            <View key={toISODate(date)}>
              <Text style={styles.agendaHeader}>
                {weekdayShort(date)}, {monthShort(date)} {date.getDate()} · {tasks.length} task
                {tasks.length === 1 ? '' : 's'}
              </Text>
              <Card>
                {tasks.map((task, i) => {
                  const list = getListById(state.lists, task.listId);
                  return (
                    <View key={task.id}>
                      <Pressable style={styles.taskRow} onPress={() => openTask(task.id)}>
                        <Text style={styles.timeLabel}>
                          {task.dueTime ? formatTime24to12(task.dueTime) : 'All day'}
                        </Text>
                        <TaskCheckbox
                          completed={task.completed}
                          priority={task.priority}
                          onPress={() => toggleComplete(task.id)}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.taskTitle, task.completed && styles.taskTitleDone]} numberOfLines={1}>
                            {task.title}
                          </Text>
                          {!!list && (
                            <Text style={styles.taskMeta} numberOfLines={1}>
                              {list.name}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.screenBg },
  calendarCol: { flex: 1, minWidth: 0, maxWidth: 620 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  navArrow: {
    fontFamily: fonts.sansRegular,
    fontSize: 20,
    color: colors.textTertiary,
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  titleYear: {
    fontFamily: fonts.sansRegular,
    color: colors.textTertiary,
  },
  todayBtn: {
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
  gridWrap: { paddingHorizontal: 12 },
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

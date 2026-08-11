import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { useDetail } from '../navigation/DetailContext';
import { useTasks } from '../data/TaskContext';
import { getListById, tasksByDate } from '../data/selectors';
import { addDays, addMonths, formatTime24to12, monthShort, toISODate, weekdayShort } from '../data/dateUtils';
import { Task } from '../data/types';
import Card from '../components/Card';
import Divider from '../components/Divider';
import MonthGrid from './calendar/MonthGrid';
import TaskCheckbox from '../components/TaskCheckbox';
import QuickAddBar from '../components/QuickAddBar';
import { IconChevronLeft, IconChevronRight, IconMenu } from '../icons/Icons';

const AGENDA_WINDOW_DAYS = 45;

export default function CalendarScreen() {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { wide, openDrawer } = useSidebar();
  const { openTask } = useDetail();
  const { state, toggleComplete, addTaskFromQuickAdd } = useTasks();
  const today = new Date();

  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);

  const byDate = useMemo(() => tasksByDate(state.tasks), [state.tasks]);

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
      <View style={[styles.header, wide && styles.paneWide]}>
        {!wide && (
          <Pressable onPress={openDrawer} hitSlop={8}>
            <IconMenu />
          </Pressable>
        )}
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

      <View style={[styles.gridCardWrap, wide && styles.paneWide]}>
        <MonthGrid
          monthAnchor={monthAnchor}
          selectedDate={selectedDate}
          today={today}
          byDate={byDate}
          onSelectDate={setSelectedDate}
          onChangeMonth={setMonthAnchor}
        />
      </View>

      <View style={[styles.quickAdd, wide && styles.paneWide]}>
        <QuickAddBar
          onSubmit={(text) => addTaskFromQuickAdd(text, { dueDate: toISODate(selectedDate) })}
          contextLabel={`${weekdayShort(selectedDate)}, ${monthShort(selectedDate)} ${selectedDate.getDate()}`}
        />
      </View>

      <ScrollView contentContainerStyle={[styles.agenda, wide && styles.paneWide]}>
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
                      onPress={() => openTask(task.id)}
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
  paneWide: { width: '100%', maxWidth: PANE_MAX_WIDTH },
  quickAdd: { paddingTop: 12 },
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
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 2,
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

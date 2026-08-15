import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { useDetail } from '../navigation/DetailContext';
import { useTasks } from '../data/TaskContext';
import { tasksByDate } from '../data/selectors';
import { addDays, addMonths, monthShort, toISODate, weekdayShort } from '../data/dateUtils';
import { Task } from '../data/types';
import AgendaDayGroup from './calendar/AgendaDayGroup';
import MonthGrid from './calendar/MonthGrid';
import QuickAddBar from '../components/QuickAddBar';
import AddTaskFab from '../components/AddTaskFab';
import { WEB_ENTRY } from '../data/platform';
import { IconChevronLeft, IconChevronRight, IconMenu } from '../icons/Icons';

const AGENDA_WINDOW_DAYS = 45;

export default function CalendarScreen() {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { wide, openDrawer } = useSidebar();
  const { openTask } = useDetail();
  const { state, addTaskFromQuickAdd } = useTasks();
  const today = new Date();

  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  // Shared between the web bar and the native composer, so a task created
  // either way is scoped to the day you've actually got selected.
  const selectedDateLabel = `${weekdayShort(selectedDate)}, ${monthShort(selectedDate)} ${selectedDate.getDate()}`;

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

      {WEB_ENTRY && (
        <View style={[styles.quickAdd, wide && styles.paneWide]}>
          <QuickAddBar
            onSubmit={(text) => addTaskFromQuickAdd(text, { dueDate: toISODate(selectedDate) })}
            contextLabel={selectedDateLabel}
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.agenda, !WEB_ENTRY && styles.agendaFab, wide && styles.paneWide]}
      >
        {agendaDays.length === 0 && (
          <Text style={styles.empty}>Nothing scheduled in the next {AGENDA_WINDOW_DAYS} days.</Text>
        )}
        {agendaDays.map(({ date, tasks }) => (
          <AgendaDayGroup
            key={toISODate(date)}
            date={date}
            tasks={tasks}
            now={today}
            onOpenTask={openTask}
          />
        ))}
      </ScrollView>

      {!WEB_ENTRY && (
        <AddTaskFab defaults={{ dueDate: toISODate(selectedDate) }} contextLabel={selectedDateLabel} />
      )}
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
  /** Clears the floating button so it never covers the last agenda row. */
  agendaFab: {
    paddingBottom: 96,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
});

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
import { tasksByDate } from '../data/selectors';
import { addDays, addMonths, addWeeks, monthShort, startOfWeek, toISODate } from '../data/dateUtils';
import { Task } from '../data/types';
import AgendaDayGroup from './calendar/AgendaDayGroup';
import MonthGrid from './calendar/MonthGrid';
import SchedulePane from './calendar/SchedulePane';
import WeekGrid from './calendar/WeekGrid';

const AGENDA_WINDOW_DAYS = 45;
const MULTI_DAY_COUNT = 3;

type Mode = 'day' | 'multi' | 'week';

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
  const { state, updateTask } = useTasks();
  const today = new Date();

  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [mode, setMode] = useState<Mode>('day');
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(today));
  const [showCompleted, setShowCompleted] = useState(false);

  // Two panes can't survive a phone-width window; Calendar is the equivalent there.
  useEffect(() => {
    if (!wide) navigation.navigate('CalendarTab');
  }, [wide, navigation]);

  // Completed tasks are hidden by default but stay reachable: on a calendar it's
  // useful to see what a day actually held, not just what's left of it.
  const byDate = useMemo(
    () => tasksByDate(state.tasks, showCompleted),
    [state.tasks, showCompleted]
  );

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

  // Switching views re-anchors the day range to the date you were looking at, so
  // week and multi-day open around the same place instead of jumping to today.
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'week') setRangeStart(startOfWeek(selectedDate));
    else if (next === 'multi') setRangeStart(selectedDate);
    setMode(next);
  };

  // The arrows and title track whichever range is on screen. Paging the range also
  // moves the month grid, so the band stays visible when a step crosses months.
  const step = (n: number) => {
    if (mode === 'day') {
      setMonthAnchor((m) => addMonths(m, n));
      return;
    }
    const next = mode === 'week' ? addWeeks(rangeStart, n) : addDays(rangeStart, n * MULTI_DAY_COUNT);
    setRangeStart(next);
    setMonthAnchor(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  // In the day-column views the month grid is a navigator: picking a day jumps the
  // range to cover it rather than only moving the selection.
  const pickDate = (date: Date) => {
    setSelectedDate(date);
    if (mode === 'week') setRangeStart(startOfWeek(date));
    else if (mode === 'multi') setRangeStart(date);
  };

  const goToday = () => {
    setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
    setRangeStart(mode === 'multi' ? today : startOfWeek(today));
    setSelectedDate(today);
  };

  // Rendered below the month grid in both modes: a filter belongs with the days it
  // filters, not crowded in among the range controls.
  const completedToggle = (
    <View style={styles.filterRow}>
      <Pressable
        style={[
          styles.todayBtn,
          { borderColor: showCompleted ? accent : colors.border },
          showCompleted && { backgroundColor: colors.accentTintBg },
        ]}
        onPress={() => setShowCompleted((v) => !v)}
      >
        <Text style={[styles.todayBtnText, { color: showCompleted ? accent : colors.textTertiary }]}>
          Completed
        </Text>
      </Pressable>
    </View>
  );

  const rangeEnd = addDays(rangeStart, mode === 'multi' ? MULTI_DAY_COUNT - 1 : 6);
  const rangeLabel =
    mode !== 'day'
      ? `${monthShort(rangeStart)} ${rangeStart.getDate()} – ${
          rangeStart.getMonth() === rangeEnd.getMonth() ? '' : `${monthShort(rangeEnd)} `
        }${rangeEnd.getDate()}`
      : `${monthAnchor.toLocaleDateString('en-US', { month: 'long' })} ${monthAnchor.getFullYear()}`;

  if (!wide) return <View style={styles.screen} />;

  return (
    <View style={[styles.row, { paddingTop: insets.top + 6 }]}>
      <SchedulePane />

      <View style={[styles.calendarCol]}>
        <View style={styles.header}>
          <Text style={styles.title}>{rangeLabel}</Text>
          <Pressable onPress={() => step(-1)} hitSlop={8}>
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <Pressable onPress={() => step(1)} hitSlop={8}>
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
          <Pressable style={[styles.todayBtn, { borderColor: colors.border }]} onPress={goToday}>
            <Text style={[styles.todayBtnText, { color: accent }]}>Today</Text>
          </Pressable>
          <View style={styles.modeToggle}>
            {(['day', 'multi', 'week'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                style={[styles.modeBtn, mode === m && { backgroundColor: accent }]}
              >
                <Text style={[styles.modeText, mode === m && { color: '#fff' }]}>
                  {m === 'day' ? 'Daily' : m === 'week' ? 'Week' : `${MULTI_DAY_COUNT} days`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {mode !== 'day' ? (
          <>
            <View style={styles.gridWrap}>
              <MonthGrid
                monthAnchor={monthAnchor}
                selectedDate={selectedDate}
                today={today}
                byDate={byDate}
                onSelectDate={pickDate}
                onChangeMonth={setMonthAnchor}
                onDropTask={scheduleTask}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
              />
            </View>
            {completedToggle}
            <WeekGrid
              startDate={rangeStart}
              dayCount={mode === 'multi' ? MULTI_DAY_COUNT : 7}
              selectedDate={selectedDate}
              today={today}
              byDate={byDate}
              onSelectDate={pickDate}
              onDropTask={scheduleTask}
              onOpenTask={openTask}
            />
          </>
        ) : (
          <>
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
          {completedToggle}

          <ScrollView contentContainerStyle={styles.agenda}>
            {agendaDays.length === 0 && <Text style={styles.empty}>Nothing scheduled from here on.</Text>}
            {agendaDays.map(({ date, tasks }) => (
              <AgendaDayGroup
                key={toISODate(date)}
                date={date}
                tasks={tasks}
                now={today}
                onOpenTask={openTask}
                onDropTask={scheduleTask}
              />
            ))}
          </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.screenBg },
  calendarCol: { flex: 1, minWidth: 0 },
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
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  modeBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  modeText: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  agenda: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
});

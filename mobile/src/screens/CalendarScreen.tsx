import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { useSidebar } from '../navigation/SidebarContext';
import { useDetail } from '../navigation/DetailContext';
import { useTasks } from '../data/TaskContext';
import { PlanMode, loadPlanPrefs, savePlanPrefs } from '../data/storage';
import { tasksByDate } from '../data/selectors';
import { addDays, addMonths, addWeeks, monthShort, startOfWeek, toISODate } from '../data/dateUtils';
import { Task } from '../data/types';
import AgendaDayGroup from './calendar/AgendaDayGroup';
import MonthGrid from './calendar/MonthGrid';
import SchedulePane from './calendar/SchedulePane';
import WeekGrid from './calendar/WeekGrid';
import QuickAddBar from '../components/QuickAddBar';
import AddTaskFab from '../components/AddTaskFab';
import { closeOpenSwipeRow } from '../components/SwipeableRow';
import { useSyncRefresh } from '../data/useSyncRefresh';
import GlassIconButton, { GlassIconButtonGroup } from '../components/GlassIconButton';
import { WEB_ENTRY } from '../data/platform';
import { IconMenu } from '../icons/Icons';
import { useDrag } from '../drag/DragContext';
import { Measurable } from '../drag/useDropTarget';

const AGENDA_WINDOW_DAYS = 45;
const MULTI_DAY_COUNT = 3;

type Mode = PlanMode;

/**
 * Wide: a scoped task list beside a calendar, drag a task onto a day to schedule
 * it, with day/multi-day/week views. Narrow: the calendar and daily agenda only —
 * there's no room for the schedule pane or the extra view modes.
 */
export default function CalendarScreen() {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const refreshControl = useSyncRefresh();
  const { wide, openDrawer } = useSidebar();
  const { openTask } = useDetail();
  const { state, updateTask, addTaskFromQuickAdd } = useTasks();
  // While a drag is in flight, the agenda must not scroll under the finger — the
  // whole point is carrying the task up out of the list onto the calendar.
  const { payload } = useDrag();
  const today = new Date();

  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);

  // The agenda clips its drop targets to this frame (see AgendaDayGroup clipTo):
  // scrolled-off days must never keep swallowing drops meant for the calendar.
  const agendaRef = useRef<ScrollView | null>(null);

  // Layout and the completed filter are how this screen is set up, not where you
  // are in it — so they're restored, while the date always opens on today.
  const [prefs, setPrefs] = useState(loadPlanPrefs);
  const { mode, showCompleted } = prefs;
  const updatePrefs = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePlanPrefs(next);
  };

  // A phone-width window can't fit the week columns, so narrow offers Daily and
  // 3-day only: a persisted 'week' falls back to Daily without touching the
  // preference, which comes back whenever the window is wide again.
  const effectiveMode: Mode = wide ? mode : mode === 'week' ? 'day' : mode;

  const [rangeStart, setRangeStart] = useState(() => (mode === 'multi' ? today : startOfWeek(today)));

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
    updatePrefs({ mode: next });
  };

  // The arrows and title track whichever range is on screen. Paging the range also
  // moves the month grid, so the band stays visible when a step crosses months.
  const step = (n: number) => {
    if (effectiveMode === 'day') {
      setMonthAnchor((m) => addMonths(m, n));
      return;
    }
    const next = effectiveMode === 'week' ? addWeeks(rangeStart, n) : addDays(rangeStart, n * MULTI_DAY_COUNT);
    setRangeStart(next);
    setMonthAnchor(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  // In the day-column views the month grid is a navigator: picking a day jumps the
  // range to cover it rather than only moving the selection.
  const pickDate = (date: Date) => {
    setSelectedDate(date);
    if (effectiveMode === 'week') setRangeStart(startOfWeek(date));
    else if (effectiveMode === 'multi') setRangeStart(date);
  };

  const goToday = () => {
    setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
    setRangeStart(mode === 'multi' ? today : startOfWeek(today));
    setSelectedDate(today);
  };

  const selectedDateLabel = `${monthShort(selectedDate)} ${selectedDate.getDate()}`;

  // Rendered below the month grid in both modes: a filter belongs with the days it
  // filters, not crowded in among the range controls. On narrow, the Daily/3-day
  // selector lives on the same line, left-aligned, opposite the filter.
  const completedToggle = (
    <View style={styles.filterRow}>
      {!wide && (
        <>
          <View style={styles.modeToggle}>
            {(['day', 'multi'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                style={[styles.modeBtn, effectiveMode === m && { backgroundColor: accent }]}
              >
                <Text style={[styles.modeText, effectiveMode === m && { color: '#fff' }]}>
                  {m === 'day' ? 'Daily' : `${MULTI_DAY_COUNT} days`}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.filterSpacer} />
        </>
      )}
      <Pressable
        style={[
          styles.todayBtn,
          { borderColor: showCompleted ? accent : colors.border },
          showCompleted && { backgroundColor: colors.accentTintBg },
        ]}
        onPress={() => updatePrefs({ showCompleted: !showCompleted })}
      >
        <Text style={[styles.todayBtnText, { color: showCompleted ? accent : colors.textTertiary }]}>
          Completed
        </Text>
      </Pressable>
    </View>
  );

  const rangeEnd = addDays(rangeStart, effectiveMode === 'multi' ? MULTI_DAY_COUNT - 1 : 6);
  const rangeLabel =
    effectiveMode !== 'day'
      ? `${monthShort(rangeStart)} ${rangeStart.getDate()} – ${
          rangeStart.getMonth() === rangeEnd.getMonth() ? '' : `${monthShort(rangeEnd)} `
        }${rangeEnd.getDate()}`
      : `${monthAnchor.toLocaleDateString('en-US', { month: 'long' })} ${monthAnchor.getFullYear()}`;

  return (
    <View style={[styles.row, { paddingTop: insets.top + 6 }]}>
      {wide && <SchedulePane />}

      <View style={styles.calendarCol}>
        <View style={styles.header}>
          {!wide && (
            <GlassIconButton onPress={openDrawer} label="Menu">
              <IconMenu />
            </GlassIconButton>
          )}
          <View style={styles.titleGroup}>
            <Pressable onPress={goToday} style={styles.titleBtn}>
              <Text style={styles.title}>{rangeLabel}</Text>
            </Pressable>
          </View>
          <GlassIconButtonGroup>
            <GlassIconButton onPress={() => step(-1)} label="Previous">
              <Text style={styles.navArrow}>‹</Text>
            </GlassIconButton>
            <GlassIconButton onPress={() => step(1)} label="Next">
              <Text style={styles.navArrow}>›</Text>
            </GlassIconButton>
          </GlassIconButtonGroup>
          {wide && (
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
          )}
        </View>

        {effectiveMode !== 'day' ? (
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
              dayCount={effectiveMode === 'multi' ? MULTI_DAY_COUNT : 7}
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

            {!wide && WEB_ENTRY && (
              <View style={styles.quickAdd}>
                <QuickAddBar
                  onSubmit={(text) => addTaskFromQuickAdd(text, { dueDate: toISODate(selectedDate) })}
                  contextLabel={selectedDateLabel}
                />
              </View>
            )}

            <ScrollView
              ref={agendaRef}
              refreshControl={refreshControl}
              onScrollBeginDrag={closeOpenSwipeRow}
              style={styles.agendaFrame}
              contentContainerStyle={[styles.agenda, !wide && !WEB_ENTRY && styles.agendaFab]}
              scrollEnabled={!payload}
            >
              {agendaDays.length === 0 && <Text style={styles.empty}>Nothing scheduled from here on.</Text>}
              {agendaDays.map(({ date, tasks }) => (
                <AgendaDayGroup
                  key={toISODate(date)}
                  date={date}
                  tasks={tasks}
                  now={today}
                  onOpenTask={openTask}
                  onDropTask={scheduleTask}
                  clipTo={agendaRef as unknown as React.RefObject<Measurable | null>}
                />
              ))}
            </ScrollView>
          </>
        )}

        {!wide && !WEB_ENTRY && (
          <AddTaskFab defaults={{ dueDate: toISODate(selectedDate) }} contextLabel={selectedDateLabel} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.screenBg },
  calendarCol: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  titleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleBtn: {
    minHeight: 36,
    justifyContent: 'center',
  },
  navArrow: {
    fontFamily: fonts.sansRegular,
    fontSize: 28,
    color: colors.textTertiary,
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.sansBold,
    fontSize: 20,
    color: colors.textPrimary,
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
    fontSize: 12.5,
  },
  gridWrap: { paddingHorizontal: 12 },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  // Pushes the Completed filter to the far end when the mode selector sits at
  // the left on narrow screens.
  filterSpacer: {
    flex: 1,
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
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  quickAdd: { paddingHorizontal: 12, paddingTop: 4 },
  // ScrollView must not paint its scrolled-off content out past its frame — a
  // day group peeking above the viewport is exactly the "under the calendar"
  // artefact the clip is there to prevent.
  agendaFrame: { overflow: 'hidden' },
  agenda: {
    /** Reaches the bottom on a light day. See TaskListScreen's `scrollContent`. */
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
  },
  agendaFab: { paddingBottom: 96 },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textTertiary,
  },
});

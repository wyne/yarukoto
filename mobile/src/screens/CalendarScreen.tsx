import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import MenuView, { type MenuAction, type NativeActionEvent } from '@expo/ui/community/menu';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { useSidebar } from '../navigation/SidebarContext';
import { useClaimDrawerSwipe } from '../navigation/drawerSwipe';
import { NATIVE_FAB_CLEARANCE, nativeTabBarClearance } from '../navigation/nativeTabBarLayout';
import { useDetail } from '../navigation/DetailContext';
import { useTasks } from '../data/TaskContext';
import { PlanMode, PlanSort, loadPlanPrefs, savePlanPrefs } from '../data/storage';
import { tasksByDate } from '../data/selectors';
import { addDays, addMonths, addWeeks, monthShort, startOfWeek, toISODate } from '../data/dateUtils';
import { Task } from '../data/types';
import AgendaDayGroup from './calendar/AgendaDayGroup';
import AddExistingTaskSheet, { AddExistingTaskButton } from './calendar/AddExistingTaskSheet';
import MonthGrid from './calendar/MonthGrid';
import SchedulePane from './calendar/SchedulePane';
import WeekGrid from './calendar/WeekGrid';
import QuickAddBar from '../components/QuickAddBar';
import AddTaskFab from '../components/AddTaskFab';
import { closeOpenSwipeRow } from '../components/SwipeableRow';
import { useSyncRefresh } from '../data/useSyncRefresh';
import GlassIconButton, { GlassIconButtonGroup, GlassTextButton, GlassTextMenuLabel } from '../components/GlassIconButton';
import { WEB_ENTRY } from '../data/platform';
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconMenu } from '../icons/Icons';
import { taskIdsFromDrag, useDragActive, useDragPayload } from '../drag/DragContext';
import { Measurable } from '../drag/useDropTarget';
import { alpha } from '../theme/colors';

const AGENDA_WINDOW_DAYS = 45;
const RANGE_DAY_OPTIONS = [2, 3] as const;
const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 } as const;

function sortCalendarTasks(tasks: Task[], sort: PlanSort, orderIds: string[] = []): Task[] {
  const arranged = new Map(orderIds.map((id, index) => [id, index]));
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (sort === 'priority') {
      const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priority) return priority;
    }
    const pa = arranged.get(a.id);
    const pb = arranged.get(b.id);
    if (pa !== undefined || pb !== undefined) {
      if (pa === undefined) return 1;
      if (pb === undefined) return -1;
      return pa - pb;
    }
    return a.order - b.order;
  });
}

function compactCalendarOrder(order: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(order).filter(([, ids]) => ids.length > 0));
}

type Mode = PlanMode;

/**
 * Wide: a scoped task list beside a calendar, drag a task onto a day to schedule
 * it, with day/multi-day/week views. Narrow: the calendar and daily agenda only —
 * there's no room for the schedule pane or the extra view modes.
 */
export default function CalendarScreen() {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const refreshControl = useSyncRefresh();
  const { wide, openDrawer } = useSidebar();
  const { openTask } = useDetail();
  const { state, bulkUpdate, addTaskFromQuickAdd } = useTasks();
  // While a drag is in flight, the agenda must not scroll under the finger — the
  // whole point is carrying the task up out of the list onto the calendar. The
  // boolean, not the payload: this is the root of the screen, and it should wake
  // for a drag starting and ending, not for every day cell the finger crosses.
  const dragging = useDragActive();
  const dragPayload = useDragPayload();
  // Every calendar surface is a drop target and a task is carried between them
  // rightward as often as any other way, so the drawer's own rightward swipe
  // stands down here. The menu button in the header still opens it.
  useClaimDrawerSwipe();
  const today = new Date();

  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  // Stable handlers: a fresh `onClose` each render reaches the sheet's backdrop
  // as a fresh component type, and the scrim it remounts is one that flickers.
  const openAddExisting = useCallback(() => setAddExistingOpen(true), []);
  const closeAddExisting = useCallback(() => setAddExistingOpen(false), []);

  // The agenda clips its drop targets to this frame (see AgendaDayGroup clipTo):
  // scrolled-off days must never keep swallowing drops meant for the calendar.
  const agendaRef = useRef<ScrollView | null>(null);

  // Layout and the completed filter are how this screen is set up, not where you
  // are in it — so they're restored, while the date always opens on today.
  const [prefs, setPrefs] = useState(loadPlanPrefs);
  const { mode, rangeDays, sort, calendarOrder, showCompleted, weekView } = prefs;
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
  const sortedByDate = useMemo(() => {
    const out = new Map<string, Task[]>();
    byDate.forEach((tasks, iso) => out.set(iso, sortCalendarTasks(tasks, sort, calendarOrder[iso])));
    return out;
  }, [byDate, sort, calendarOrder]);
  const draggingCompleted = useMemo(() => {
    if (!dragPayload) return false;
    const ids = taskIdsFromDrag(dragPayload);
    return ids.length > 0 && ids.every((id) => !!state.tasks.find((task) => task.id === id)?.completed);
  }, [dragPayload, state.tasks]);

  const agendaDays = useMemo(() => {
    const out: { date: Date; tasks: Task[] }[] = [];
    for (let i = 0; i < AGENDA_WINDOW_DAYS && out.length < 12; i++) {
      const d = addDays(selectedDate, i);
      const tasks = sortedByDate.get(toISODate(d));
      if (tasks && tasks.length) out.push({ date: d, tasks });
    }
    return out;
  }, [selectedDate, sortedByDate]);

  // Scheduling only sets the date — an existing time of day is left alone, and the
  // day you're looking at stays put rather than following the drop.
  const scheduleTasks = (taskIds: string[], iso: string, beforeId: string | null = null) => {
    const moving = new Set(taskIds);
    if (sort === 'custom') {
      const nextOrder: Record<string, string[]> = { ...calendarOrder };
      const touched = new Set<string>([iso]);
      for (const task of state.tasks) {
        if (moving.has(task.id) && task.dueDate) touched.add(task.dueDate);
      }
      for (const date of touched) {
        const current = sortedByDate.get(date) ?? [];
        nextOrder[date] = current.map((task) => task.id).filter((id) => !moving.has(id));
      }
      const target = nextOrder[iso] ?? [];
      const at = beforeId ? target.indexOf(beforeId) : -1;
      const insertAt = at === -1 ? target.length : at;
      target.splice(insertAt, 0, ...taskIds);
      nextOrder[iso] = target;
      updatePrefs({ calendarOrder: compactCalendarOrder(nextOrder) });
    }
    const needsDate = taskIds.some((id) => state.tasks.find((task) => task.id === id)?.dueDate !== iso);
    if (needsDate) bulkUpdate(taskIds, { dueDate: iso });
  };

  const switchView = (next: Mode, nextRangeDays = rangeDays) => {
    if (next === 'week') setRangeStart(startOfWeek(selectedDate));
    else if (next === 'multi') setRangeStart(selectedDate);
    updatePrefs({ mode: next, rangeDays: nextRangeDays });
  };

  // The arrows and title track whichever range is on screen. Paging the range also
  // moves the month grid, so the band stays visible when a step crosses months.
  const step = (n: number) => {
    if (effectiveMode === 'day') {
      setMonthAnchor((m) => addMonths(m, n));
      return;
    }
    const next = effectiveMode === 'week' ? addWeeks(rangeStart, n) : addDays(rangeStart, n * rangeDays);
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

  // Both day views run to the bottom of the screen, under a tab bar and a FAB.
  // Both are zero where neither exists: a wide layout has no tab bar, and web
  // pins the QuickAddBar in place of the button.
  const nativeChrome = !wide && !WEB_ENTRY;
  const tabBarInset = nativeChrome ? nativeTabBarClearance(insets.bottom) : 0;
  const fabClearance = nativeChrome ? NATIVE_FAB_CLEARANCE : 0;
  const viewLabel = effectiveMode === 'day' ? 'Daily' : effectiveMode === 'week' ? 'Week' : `${rangeDays} days`;
  const sortLabel = sort === 'priority' ? 'Priority' : 'Custom';
  const viewActions: MenuAction[] = [
    { id: 'day', title: 'Daily', state: mode === 'day' ? 'on' : 'off' },
    ...RANGE_DAY_OPTIONS.map((days) => ({
      id: `range:${days}`,
      title: `${days} days`,
      state: mode === 'multi' && rangeDays === days ? 'on' as const : 'off' as const,
    })),
    { id: 'week', title: 'Week', state: mode === 'week' ? 'on' : 'off', attributes: { hidden: !wide } },
  ];
  const sortActions: MenuAction[] = [
    { id: 'custom', title: 'Custom', state: sort === 'custom' ? 'on' : 'off' },
    { id: 'priority', title: 'Priority', state: sort === 'priority' ? 'on' : 'off' },
  ];
  const handleViewAction = ({ nativeEvent }: NativeActionEvent) => {
    if (nativeEvent.event === 'day') switchView('day');
    else if (nativeEvent.event === 'week') switchView('week');
    else if (nativeEvent.event === 'range:2') switchView('multi', 2);
    else if (nativeEvent.event === 'range:3') switchView('multi', 3);
  };
  const handleSortAction = ({ nativeEvent }: NativeActionEvent) => {
    if (nativeEvent.event === 'custom' || nativeEvent.event === 'priority') updatePrefs({ sort: nativeEvent.event });
  };
  const cycleView = () => {
    if (effectiveMode === 'day') switchView('multi', 2);
    else if (effectiveMode === 'multi' && rangeDays === 2) switchView('multi', 3);
    else if (wide && effectiveMode === 'multi') switchView('week');
    else switchView('day');
  };
  const toggleSort = () => updatePrefs({ sort: sort === 'custom' ? 'priority' : 'custom' });

  const menuLabel = (label: string) => (
    <View style={styles.menuBtnContent}>
      <Text style={styles.menuBtnText}>{label}</Text>
      <IconChevronDown size={12} color={colors.textTertiary} />
    </View>
  );

  const viewMenu = WEB_ENTRY ? (
    <GlassTextButton onPress={cycleView} label="Calendar view">
      {menuLabel(viewLabel)}
    </GlassTextButton>
  ) : (
    <MenuView actions={viewActions} onPressAction={handleViewAction}>
      <GlassTextMenuLabel label="Calendar view">{menuLabel(viewLabel)}</GlassTextMenuLabel>
    </MenuView>
  );

  const sortMenu = WEB_ENTRY ? (
    <GlassTextButton onPress={toggleSort} label="Calendar sort">
      {menuLabel(`Sort: ${sortLabel}`)}
    </GlassTextButton>
  ) : (
    <MenuView actions={sortActions} onPressAction={handleSortAction}>
      <GlassTextMenuLabel label="Calendar sort">{menuLabel(`Sort: ${sortLabel}`)}</GlassTextMenuLabel>
    </MenuView>
  );

  // Rendered below the month grid in both modes: a filter belongs with the days it
  // filters, not crowded in among the range controls. The native menu triggers
  // are system-owned so their glass and menu transitions come from the platform.
  const completedToggle = (
    <View style={styles.filterRow}>
      <View style={styles.filterMenus}>
        {viewMenu}
        {sortMenu}
      </View>
      <View style={styles.filterSpacer} />
      <Pressable
        style={[
          styles.todayBtn,
          { borderColor: showCompleted ? accent : colors.border },
          showCompleted && { backgroundColor: alpha(accent, 0.14) },
        ]}
        onPress={() => updatePrefs({ showCompleted: !showCompleted })}
      >
        <Text style={[styles.todayBtnText, { color: showCompleted ? accent : colors.textTertiary }]}>
          Completed
        </Text>
      </Pressable>
    </View>
  );

  const rangeEnd = addDays(rangeStart, effectiveMode === 'multi' ? rangeDays - 1 : 6);
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
              <IconChevronLeft size={18} />
            </GlassIconButton>
            <GlassIconButton onPress={() => step(1)} label="Next">
              <IconChevronRight size={18} />
            </GlassIconButton>
          </GlassIconButtonGroup>
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
                onDropTask={scheduleTasks}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                weekView={weekView}
                onWeekViewChange={(next) => updatePrefs({ weekView: next })}
              />
            </View>
            {completedToggle}
            <WeekGrid
              startDate={rangeStart}
              dayCount={effectiveMode === 'multi' ? rangeDays : 7}
              selectedDate={selectedDate}
              today={today}
              byDate={sortedByDate}
              onSelectDate={pickDate}
              onDropTask={scheduleTasks}
              onOpenTask={openTask}
              reorderable={sort === 'custom'}
              draggingCompleted={draggingCompleted}
              // The columns are boxes, not a list: their frames have to stop
              // above the tab bar rather than run under it, which then leaves
              // only the button for the chips inside to clear.
              bottomInset={tabBarInset}
              bottomClearance={fabClearance}
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
                onDropTask={scheduleTasks}
                weekView={weekView}
                onWeekViewChange={(next) => updatePrefs({ weekView: next })}
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
              // The agenda does scroll to the screen edge, so its last group has
              // both the bar and the button to get out from under.
              contentContainerStyle={[
                styles.agenda,
                nativeChrome && { paddingBottom: tabBarInset + fabClearance },
              ]}
              scrollEnabled={!dragging}
            >
              {agendaDays.length === 0 && <Text style={styles.empty}>Nothing scheduled from here on.</Text>}
              {agendaDays.map(({ date, tasks }) => (
                <AgendaDayGroup
                  key={toISODate(date)}
                  date={date}
                  tasks={tasks}
                  now={today}
                  onOpenTask={openTask}
                  onDropTask={scheduleTasks}
                  reorderable={sort === 'custom'}
                  draggingCompleted={draggingCompleted}
                  clipTo={agendaRef as unknown as React.RefObject<Measurable | null>}
                />
              ))}
            </ScrollView>
          </>
        )}

        {!wide && !WEB_ENTRY && (
          <>
            <AddExistingTaskButton onPress={openAddExisting} />
            {/* A drag turns the button beside it into the cancel target; the FAB
                is one more thing to drop onto that means nothing. */}
            <AddTaskFab
              defaults={{ dueDate: toISODate(selectedDate) }}
              contextLabel={selectedDateLabel}
              hidden={dragging}
            />
            <AddExistingTaskSheet visible={addExistingOpen} onClose={closeAddExisting} />
          </>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flex: 1, flexDirection: 'row', backgroundColor: c.screenBg },
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
  title: {
    flexShrink: 1,
    fontFamily: fonts.sansBold,
    fontSize: 20,
    color: c.textPrimary,
  },
  todayBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: c.surface,
  },
  todayBtnText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
  },
  gridWrap: { paddingHorizontal: 12 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  filterMenus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  menuBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  menuBtnText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textSecondary,
  },
  // Pushes the Completed filter to the far end when the mode selector sits at
  // the left on narrow screens.
  filterSpacer: {
    flex: 1,
  },
  quickAdd: { paddingHorizontal: 12, paddingTop: 4 },
  // ScrollView must not paint its scrolled-off content out past its frame — a
  // day group peeking above the viewport is exactly the "under the calendar"
  // artefact the clip is there to prevent. The flex is what lets it take the
  // height the calendar hands back when the month is collapsed to a week.
  agendaFrame: { flex: 1, overflow: 'hidden' },
  agenda: {
    /** Reaches the bottom on a light day. See TaskListScreen's `scrollContent`. */
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
}));

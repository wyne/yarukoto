import React, { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import MenuView, { type MenuAction, type NativeActionEvent } from '../components/NativeMenu';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { useSidebar } from '../navigation/SidebarContext';
import { useClaimDrawerSwipe } from '../navigation/drawerSwipe';
import { NATIVE_FAB_CLEARANCE, nativeTabBarClearance } from '../navigation/nativeTabBarLayout';
import { useDetailActions, useOverlayDetailWhileFocused } from '../navigation/DetailContext';
import { useTasks } from '../data/TaskContext';
import { PlanMode, PlanSort, loadPlanPrefs, savePlanPrefs } from '../data/storage';
import { tasksByDate } from '../data/selectors';
import { addDays, addMonths, addWeeks, dayRangeLabel, monthShort, startOfWeek, toISODate } from '../data/dateUtils';
import { Task } from '../data/types';
import AgendaDayGroup from './calendar/AgendaDayGroup';
import AddExistingTaskSheet, { AddExistingTaskButton } from './calendar/AddExistingTaskSheet';
import MonthGrid from './calendar/MonthGrid';
import SchedulePane, { SCHEDULE_PANE_WIDTH, SchedulePaneRail } from './calendar/SchedulePane';
import WeekGrid from './calendar/WeekGrid';
import QuickAddBar from '../components/QuickAddBar';
import { useWindowSelector } from '../components/useWindowSelector';
import AddTaskFab from '../components/AddTaskFab';
import { closeOpenSwipeRow } from '../components/SwipeableRow';
import { useSyncRefresh } from '../data/useSyncRefresh';
import GlassIconButton, { GlassIconButtonGroup, GlassTextButton, GlassTextMenuLabel } from '../components/GlassIconButton';
import { DESKTOP_UI, FLOATING_TAB_BAR } from '../data/platform';
import { IconCheckBig, IconChevronDown, IconChevronLeft, IconChevronRight, IconMenu } from '../icons/Icons';
import Popover, { type PopoverAnchor } from '../components/Popover';
import { MenuRow } from '../components/menu/MenuItems';
import { taskIdsFromDrag, useDragActive, useDragPayload } from '../drag/DragContext';
import { Measurable } from '../drag/useDropTarget';
import ResizeCursorView from '../../modules/mac-pointer/src/ResizeCursorView';
import { alpha } from '../theme/colors';

const AGENDA_WINDOW_DAYS = 45;
const RANGE_DAY_OPTIONS = [2, 3] as const;
const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 } as const;
const PLAN_PANE_MIN_WIDTH = 280;
const CALENDAR_MIN_WIDTH = 280;
const PANE_RESIZER_WIDTH = 11;
/** Wide enough for the view, sort and Completed controls to sit in the header beside the title. */
const HEADER_CONTROLS_MIN_WIDTH = 600;

function sortCalendarTasks(tasks: Task[], sort: PlanSort): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (sort === 'priority') {
      const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priority) return priority;
    }
    return a.order - b.order;
  });
}

function orderNeighbors(
  tasks: Task[],
  moving: Set<string>,
  beforeId: string | null
): { prevId: string | null; nextId: string | null } | null {
  const remaining = tasks.filter((task) => !moving.has(task.id));
  if (beforeId) {
    const at = remaining.findIndex((task) => task.id === beforeId);
    if (at !== -1) return { prevId: remaining[at - 1]?.id ?? null, nextId: beforeId };
  }
  const prevId = remaining[remaining.length - 1]?.id ?? null;
  return prevId ? { prevId, nextId: null } : null;
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
  const { openTask } = useDetailActions();
  const { state, bulkUpdate, reorderTasks } = useTasks();
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
  // A task opened from the calendar comes over it, so the day columns keep
  // their width rather than reflowing each time one opens and closes.
  useOverlayDetailWhileFocused();
  const today = new Date();

  // What the calendar is showing, read as a month or as a week depending on
  // whether it is collapsed. It is the calendar's own place in time: paging it
  // moves this and nothing else, so it drifts away from the selection and from
  // the day views below at will.
  const [anchor, setAnchor] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  /**
   * A narrow desktop window's way to the plan pane, which a wide one always
   * shows. The phone's route to the same tasks is a sheet you drag out of, a
   * touch gesture; a pointer drags from the pane, so the pane comes to it.
   */
  const [planOpen, setPlanOpen] = useState(false);
  const planFits = useWindowSelector(
    (window) => window.width >= PLAN_PANE_MIN_WIDTH + PANE_RESIZER_WIDTH + CALENDAR_MIN_WIDTH
  );
  // A wide desktop window can put the pane away too, for looking at the calendar
  // rather than filling it; that choice is kept, where a narrow window's is not.
  const canTogglePlan = DESKTOP_UI && planFits;
  // A ref, not state: only the pane divider's drag reads it, and as state every
  // frame of a window resize re-rendered the whole calendar to store it.
  const rowWidth = useRef(0);
  const [schedulePaneWidth, setSchedulePaneWidth] = useState(SCHEDULE_PANE_WIDTH);
  const schedulePaneWidthRef = useRef(schedulePaneWidth);
  const resizeStartWidth = useRef(schedulePaneWidth);
  // Stable handlers: a fresh `onClose` each render reaches the sheet's backdrop
  // as a fresh component type, and the scrim it remounts is one that flickers.
  const openAddExisting = useCallback(() => setAddExistingOpen(true), []);
  const closeAddExisting = useCallback(() => setAddExistingOpen(false), []);

  // The agenda clips its drop targets to this frame (see AgendaDayGroup clipTo):
  // scrolled-off days must never keep swallowing drops meant for the calendar.
  const agendaRef = useRef<ScrollView | null>(null);

  const clampSchedulePaneWidth = useCallback(
    (width: number) => {
      const max = rowWidth.current
        ? Math.max(PLAN_PANE_MIN_WIDTH, rowWidth.current - CALENDAR_MIN_WIDTH - PANE_RESIZER_WIDTH)
        : SCHEDULE_PANE_WIDTH;
      return Math.min(Math.max(width, PLAN_PANE_MIN_WIDTH), max);
    },
    []
  );
  const setClampedSchedulePaneWidth = useCallback(
    (width: number) => {
      const next = clampSchedulePaneWidth(width);
      schedulePaneWidthRef.current = next;
      setSchedulePaneWidth(next);
    },
    [clampSchedulePaneWidth]
  );
  const resizePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => DESKTOP_UI,
        onMoveShouldSetPanResponder: () => DESKTOP_UI,
        onPanResponderGrant: () => {
          resizeStartWidth.current = schedulePaneWidthRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          setClampedSchedulePaneWidth(resizeStartWidth.current + gesture.dx);
        },
      }),
    [setClampedSchedulePaneWidth]
  );
  const handleRowLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;
      rowWidth.current = nextWidth;
      if (!DESKTOP_UI) return;
      const max = Math.max(PLAN_PANE_MIN_WIDTH, nextWidth - CALENDAR_MIN_WIDTH - PANE_RESIZER_WIDTH);
      if (schedulePaneWidthRef.current > max) {
        schedulePaneWidthRef.current = max;
        setSchedulePaneWidth(max);
      }
    },
    []
  );

  // Layout and the completed filter are how this screen is set up, not where you
  // are in it — so they're restored, while the date always opens on today.
  const [prefs, setPrefs] = useState(loadPlanPrefs);
  const { mode, rangeDays, sort, showCompleted, weekView, planPane } = prefs;
  const updatePrefs = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePlanPrefs(next);
  };
  const showPlan = wide ? !DESKTOP_UI || planPane : canTogglePlan && planOpen;
  const togglePlan = () => (wide ? updatePrefs({ planPane: !planPane }) : setPlanOpen((open) => !open));

  // A phone-width window can't fit the week columns, so narrow offers Daily and
  // 3-day only: a persisted 'week' falls back to Daily without touching the
  // preference, which comes back whenever the window is wide again.
  const effectiveMode: Mode = wide ? mode : mode === 'week' ? 'day' : mode;

  const [rangeStart, setRangeStart] = useState(() => (effectiveMode === 'multi' ? today : startOfWeek(today)));
  // Measured, not derived from the window: the plan pane and the task pane both
  // take from the same width.
  const [headerRoom, setHeaderRoom] = useState(false);
  const handleCalendarLayout = useCallback((event: LayoutChangeEvent) => {
    const roomy = event.nativeEvent.layout.width >= HEADER_CONTROLS_MIN_WIDTH;
    setHeaderRoom((current) => (current === roomy ? current : roomy));
  }, []);
  const controlsInHeader = DESKTOP_UI && headerRoom;

  // Completed tasks are hidden by default but stay reachable: on a calendar it's
  // useful to see what a day actually held, not just what's left of it.
  const byDate = useMemo(
    () => tasksByDate(state.tasks, showCompleted),
    [state.tasks, showCompleted]
  );
  const sortedByDate = useMemo(() => {
    const out = new Map<string, Task[]>();
    byDate.forEach((tasks, iso) => out.set(iso, sortCalendarTasks(tasks, sort)));
    return out;
  }, [byDate, sort]);
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
      const neighbors = orderNeighbors(sortedByDate.get(iso) ?? [], moving, beforeId);
      if (neighbors) reorderTasks(taskIds, neighbors.prevId, neighbors.nextId);
    }
    const needsDate = taskIds.some((id) => state.tasks.find((task) => task.id === id)?.dueDate !== iso);
    if (needsDate) bulkUpdate(taskIds, { dueDate: iso });
  };

  const switchView = (next: Mode, nextRangeDays = rangeDays) => {
    if (next === 'week') setRangeStart(startOfWeek(selectedDate));
    else if (next === 'multi') setRangeStart(selectedDate);
    updatePrefs({ mode: next, rangeDays: nextRangeDays });
  };

  // The arrows page the calendar by whatever it is showing, which is what the
  // swipe does — a month expanded, a week collapsed. Neither moves the day views
  // below: scrolling the calendar ahead is how a day out of their reach becomes a
  // drop target for a task that is on screen right now.
  const step = (n: number) => {
    setAnchor((a) => (weekView ? addWeeks(startOfWeek(a), n) : addMonths(a, n)));
  };

  // In the day-column views the month grid is a navigator: picking a day jumps the
  // range to cover it rather than only moving the selection.
  const pickDate = (date: Date) => {
    setSelectedDate(date);
    if (effectiveMode === 'week') setRangeStart(startOfWeek(date));
    else if (effectiveMode === 'multi') setRangeStart(date);
  };

  const goToday = () => {
    setAnchor(today);
    setRangeStart(effectiveMode === 'multi' ? today : startOfWeek(today));
    setSelectedDate(today);
  };

  const selectedDateLabel = `${monthShort(selectedDate)} ${selectedDate.getDate()}`;

  // Both day views run to the bottom of the screen, under a tab bar and a FAB.
  // Each is zero where it doesn't exist: a wide layout has neither, the web tab
  // bar doesn't float, and the desktop pins the QuickAddBar in place of the
  // button. They are separate because a narrow Mac window has the one without
  // the other.
  const tabBarInset = !wide && FLOATING_TAB_BAR ? nativeTabBarClearance(insets.bottom) : 0;
  const fabClearance = !wide && !DESKTOP_UI ? NATIVE_FAB_CLEARANCE : 0;
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
  // The desktop draws the same actions as a popover menu: a choice among a few,
  // where cycling through them to reach one is a detour.
  const viewBtn = useRef<View>(null);
  const sortBtn = useRef<View>(null);
  const [openMenu, setOpenMenu] = useState<{ kind: 'view' | 'sort'; anchor: PopoverAnchor } | null>(null);
  const showMenu = (kind: 'view' | 'sort') => {
    (kind === 'view' ? viewBtn : sortBtn).current?.measureInWindow((x, y, width, height) =>
      setOpenMenu({ kind, anchor: { x, y, width, height } })
    );
  };
  const menuActions = openMenu?.kind === 'view' ? viewActions : sortActions;
  const pickMenuAction = (id: string) => {
    const kind = openMenu?.kind;
    setOpenMenu(null);
    const event = { nativeEvent: { event: id } } as NativeActionEvent;
    if (kind === 'view') handleViewAction(event);
    else handleSortAction(event);
  };

  const menuLabel = (label: string) => (
    <View style={styles.menuBtnContent}>
      <Text style={styles.menuBtnText}>{label}</Text>
      <IconChevronDown size={12} color={colors.textTertiary} />
    </View>
  );

  const viewMenu = DESKTOP_UI ? (
    <View ref={viewBtn} collapsable={false}>
      <GlassTextButton onPress={() => showMenu('view')} label="Calendar view" compact>
        {menuLabel(viewLabel)}
      </GlassTextButton>
    </View>
  ) : (
    <MenuView actions={viewActions} onPressAction={handleViewAction}>
      <GlassTextMenuLabel label="Calendar view" compact>
        {menuLabel(viewLabel)}
      </GlassTextMenuLabel>
    </MenuView>
  );

  const sortMenu = DESKTOP_UI ? (
    <View ref={sortBtn} collapsable={false}>
      <GlassTextButton onPress={() => showMenu('sort')} label="Calendar sort" compact>
        {menuLabel(`Sort: ${sortLabel}`)}
      </GlassTextButton>
    </View>
  ) : (
    <MenuView actions={sortActions} onPressAction={handleSortAction}>
      <GlassTextMenuLabel label="Calendar sort" compact>
        {menuLabel(`Sort: ${sortLabel}`)}
      </GlassTextMenuLabel>
    </MenuView>
  );

  // Rendered below the month grid in both modes: a filter belongs with the days it
  // filters, not crowded in among the range controls. The native menu triggers
  // are system-owned so their glass and menu transitions come from the platform.
  const completedPill = (
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
  );
  // A roomy desktop column takes them into the header instead, so the day
  // columns start right under the calendar.
  const completedToggle = controlsInHeader ? null : (
    <View style={styles.filterRow}>
      <View style={styles.filterMenus}>
        {viewMenu}
        {sortMenu}
      </View>
      <View style={styles.filterSpacer} />
      {completedPill}
    </View>
  );

  const rangeEnd = addDays(rangeStart, effectiveMode === 'multi' ? rangeDays - 1 : 6);
  // Names the calendar, not the range below it — the arrows move the calendar, so
  // the title is what they move. The day views say where they are with the band.
  const weekStart = startOfWeek(anchor);
  const calendarLabel = weekView
    ? dayRangeLabel(weekStart, addDays(weekStart, 6))
    : `${anchor.toLocaleDateString('en-US', { month: 'long' })} ${anchor.getFullYear()}`;

  return (
    <View style={[styles.row, { paddingTop: insets.top + 6 }]} onLayout={handleRowLayout}>
      {showPlan && (
        <SchedulePane
          // Clamped here as well as on resize: opened into a narrow window, the
          // width it last had may not leave the calendar its share.
          width={DESKTOP_UI ? clampSchedulePaneWidth(schedulePaneWidth) : undefined}
          showRightBorder={!DESKTOP_UI}
          onHide={canTogglePlan ? togglePlan : undefined}
        />
      )}
      {canTogglePlan && !showPlan && <SchedulePaneRail onShow={togglePlan} />}
      {showPlan && DESKTOP_UI && (
        <ResizeCursorView
          style={styles.paneResizer}
          accessibilityRole="adjustable"
          accessibilityLabel="Resize plan task pane"
          {...resizePan.panHandlers}
        >
          <View style={styles.paneResizerLine} />
        </ResizeCursorView>
      )}

      <View
        style={[styles.calendarCol, showPlan && DESKTOP_UI && styles.calendarColResizable]}
        onLayout={handleCalendarLayout}
      >
        <View style={styles.header}>
          {!wide && (
            <GlassIconButton onPress={openDrawer} label="Menu" shortcut="toggleSidebar">
              <IconMenu />
            </GlassIconButton>
          )}
          <View style={styles.titleGroup}>
            <Pressable onPress={goToday} style={styles.titleBtn}>
              <Text style={styles.title}>{calendarLabel}</Text>
            </Pressable>
          </View>
          {controlsInHeader && (
            <View style={styles.headerControls}>
              {viewMenu}
              {sortMenu}
              {completedPill}
            </View>
          )}
          {/* The title does this too, but nothing about a title says so. */}
          <Pressable
            onPress={goToday}
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            style={[styles.todayBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.todayBtnText, { color: colors.textSecondary }]}>Today</Text>
          </Pressable>
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
                anchor={anchor}
                selectedDate={selectedDate}
                today={today}
                byDate={byDate}
                onSelectDate={pickDate}
                onChangeAnchor={setAnchor}
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
              lists={state.lists}
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
                anchor={anchor}
                selectedDate={selectedDate}
                today={today}
                byDate={byDate}
                onSelectDate={setSelectedDate}
                onChangeAnchor={setAnchor}
                onDropTask={scheduleTasks}
                weekView={weekView}
                onWeekViewChange={(next) => updatePrefs({ weekView: next })}
              />
            </View>
            {completedToggle}

            {!wide && DESKTOP_UI && (
              <View style={styles.quickAdd}>
                <QuickAddBar
                  defaults={{ dueDate: toISODate(selectedDate) }}
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
                tabBarInset + fabClearance > 0 && { paddingBottom: tabBarInset + fabClearance },
              ]}
              scrollEnabled={!dragging}
            >
              {agendaDays.length === 0 && <Text style={styles.empty}>Nothing scheduled from here on.</Text>}
              {agendaDays.map(({ date, tasks }) => (
                <AgendaDayGroup
                  key={toISODate(date)}
                  date={date}
                  tasks={tasks}
                  lists={state.lists}
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

        {DESKTOP_UI && (
          <Popover visible={!!openMenu} onClose={() => setOpenMenu(null)} anchor={openMenu?.anchor ?? null} width={180}>
            {menuActions
              .filter((action) => !action.attributes?.hidden)
              .map((action) => (
                <MenuRow
                  key={action.id}
                  icon={action.state === 'on' ? <IconCheckBig size={14} color={accent} /> : null}
                  label={action.title}
                  onPress={() => pickMenuAction(action.id!)}
                />
              ))}
          </Popover>
        )}

        {!wide && !DESKTOP_UI && (
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
  calendarColResizable: { minWidth: CALENDAR_MIN_WIDTH },
  paneResizer: {
    width: PANE_RESIZER_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    backgroundColor: c.screenBg,
    ...({ cursor: 'col-resize', userSelect: 'none' } as object),
  },
  paneResizerLine: {
    width: 1,
    flex: 1,
    backgroundColor: c.border,
  },
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
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
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
  // ScrollView must not paint its scrolled-off content out past its frame — a
  // day group peeking above the viewport is exactly the "under the calendar"
  // artefact the clip is there to prevent. The flex is what lets it take the
  // height the calendar hands back when the month is collapsed to a week.
  // Over the agenda below it, which the chips' tooltips hang down into.
  quickAdd: { paddingHorizontal: 12, paddingTop: 4, zIndex: 1 },
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

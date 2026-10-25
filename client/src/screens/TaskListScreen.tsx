import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import MenuView, { type MenuAction } from '../components/NativeMenu';
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedRef,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import {
  activeTasks,
  completedInboxTasks,
  completedTasksList,
  inboxTasks,
  listsInFolder,
  tasksDueWithin,
} from '../data/selectors';
import { TODAY_DAYS_OPTIONS, TodayDays, loadTodayDays, saveTodayDays } from '../data/storage';
import { isSameDay, toISODate } from '../data/dateUtils';
import { QuickAddDefaults } from '../data/TaskContext';
import { hapticSelect } from '../data/haptics';
import { useSyncRefresh } from '../data/useSyncRefresh';
import { DESKTOP_UI, FINE_POINTER, FLOATING_TAB_BAR, MAC_KEYS } from '../data/platform';
import {
  GroupBy,
  INBOX_GROUP_KEY,
  SortBy,
  TaskGroup,
  ViewOptions,
  groupByDay,
  groupTasks,
  viewKey,
} from '../data/viewOptions';
import { useCollapsedSections } from '../data/uiPrefs';
import { Task } from '../data/types';
import { useIsFocused } from '@react-navigation/native';
import { TaskListFilter } from '../navigation/types';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { NATIVE_FAB_CLEARANCE, nativeTabBarClearance } from '../navigation/nativeTabBarLayout';
import { useDetail } from '../navigation/DetailContext';
import { useSelection } from '../navigation/SelectionContext';
import { showPalettePicker, useCommand } from '../navigation/MenuCommands';
import { commandDef, formatShortcut } from '../navigation/commands';
import { showKeyHint } from '../navigation/keyHint';
import { showAddedNotice } from '../navigation/addedNotice';
import { taskHome } from '../navigation/showTask';
import { type ListStop, groupStop, listStops, rangeBetween, stepCursor, stepStop } from '../data/listCursor';
import TaskRow from '../components/TaskRow';
import ListKeys from '../components/ListKeys';
import {
  focusNextPane,
  focusPane,
  releaseWebField,
  takeKeyboardFromSidebar,
  useListHasKeyboard,
  usePaneFocus,
} from '../navigation/focusPanes';

/** How far Page Up and Page Down move the cursor: about a window's worth of rows. */
const PAGE_ROWS = 10;
import { useRowContext } from '../components/useRowContext';
import Card from '../components/Card';
import Divider from '../components/Divider';
import DragList from '../components/DragList';
import VirtualTaskList, {
  ROW_HIGHLIGHTED,
  ROW_MUTED,
  ROW_SELECTED,
  type RowRenderInfo,
  type VirtualTaskListHandle,
  type VirtualTaskListRef,
} from '../components/VirtualTaskList';
import SectionHeader from '../components/SectionHeader';
import QuickAddBar from '../components/QuickAddBar';
import BulkActionBar from '../components/BulkActionBar';
import AddTaskFab from '../components/AddTaskFab';
import ViewOptionsSheet from '../components/ViewOptionsSheet';
import ContextMenuTarget from '../components/ContextMenuTarget';
import TaskContextMenu from '../components/TaskContextMenu';
import Popover, { type PopoverAnchor } from '../components/Popover';
import Tooltip from '../components/Tooltip';
import { closeOpenSwipeRow } from '../components/SwipeableRow';
import { useLazyMount } from '../components/lazyMount';
import GlassIconButton, { GlassIconMenuLabel, GlassTextButton } from '../components/GlassIconButton';
import { MenuRow } from '../components/menu/MenuItems';
import DueDatePickerSheet from '../components/pickers/DueDatePickerSheet';
import ListPickerSheet from '../components/pickers/ListPickerSheet';
import TagPickerSheet from '../components/pickers/TagPickerSheet';
import { IconCheckBig, IconChevronDown, IconDotsHorizontal, IconMenu, IconViewOptions } from '../icons/Icons';

const TITLES = { all: 'All', inbox: 'Inbox', today: 'Agenda' } as const;
/** The Agenda's title is the stretch it covers, so it always says what is on screen. */
const TODAY_DAYS_LABEL: Record<TodayDays, string> = { 1: 'Today', 2: 'Next 2 days', 3: 'Next 3 days', 7: 'Week' };
/**
 * Native lists only build the rows near the screen; see `VirtualTaskList`. The
 * web keeps the fully built column, whose drag and hover wiring is DOM-specific.
 */
const VIRTUALIZED = Platform.OS !== 'web';
/** Room left between a revealed row and the edge it was brought in from. */
const REVEAL_MARGIN = 8;
/** How many frames a revealed row on the web is followed while it settles. */
const REVEAL_SETTLE_FRAMES = 45;
const GROUP_LAYOUT = LinearTransition.duration(180);
const GROUP_ENTER = FadeIn.duration(140);
/**
 * No exit to match the entrance.
 *
 * An exiting animation is the one that cannot be called off for a change of
 * view: Reanimated reads it from the element being removed, and that element's
 * last render was the one before anything knew a change was coming. So it fired
 * on every switch, and it fires by holding the outgoing views on screen for its
 * whole duration — which put both lists' rows in the tree at once, in the frames
 * the new one was being built.
 *
 * What it cost within a view was a group fading rather than closing when it is
 * folded shut. The rows around it still slide, since they animate their own
 * layout, so the fold still reads as one movement.
 */

interface Props {
  mode: 'all' | 'inbox' | 'today';
  filter?: TaskListFilter;
}

/**
 * The screen proper sits behind a memo that holds it still while it isn't in
 * front. Tab screens stay mounted, and each one reads the open task and the
 * cursor, so without this every ↑ and ↓ in the list on screen also re-rendered
 * every list that wasn't. What those two were is handed down rather than read
 * from context inside, since a context read would go around the memo.
 */
export default function TaskListScreen({ mode, filter }: Props) {
  const detail = useDetail();
  const selection = useSelection();
  const focused = useIsFocused();
  return <TaskListBody mode={mode} filter={filter} detail={detail} selection={selection} focused={focused} />;
}

interface BodyProps extends Props {
  detail: ReturnType<typeof useDetail>;
  selection: ReturnType<typeof useSelection>;
  focused: boolean;
}

const sameFilter = (a?: TaskListFilter, b?: TaskListFilter) =>
  a === b || (!!a && !!b && a.type === b.type && a.value === b.value && a.label === b.label);

const TaskListBody = memo(
  function TaskListBody({ mode, filter, detail, selection }: BodyProps) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const refreshControl = useSyncRefresh();
  const { wide, openDrawer } = useSidebar();
  const rowContext = useRowContext();
  const { openTask, openTaskId, closeTask } = detail;
  const {
    state,
    updateTask,
    toggleComplete,
    skipOccurrence,
    scheduleToday,
    snoozeTask,
    scheduleNextWeek,
    reorderTasks,
    setArrangement,
    clearArrangement,
    deleteTasks,
    bulkUpdate,
    getViewOptions,
    setViewOptions,
  } = useTasks();
  const now = new Date();

  // Hosts every group's DragList; passed down so dragging auto-scrolls the page.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const listRef = useRef<VirtualTaskListRef>(null);
  const listHandle = useRef<VirtualTaskListHandle>(null);

  const key = viewKey(mode, filter);
  // getViewOptions normalises a stored preference into a new object. Keep that
  // identity stable until this view's preferences actually change, otherwise
  // local UI state (opening a menu, selection, sync status) needlessly
  // invalidates the comparatively expensive group/sort pass below.
  const options = useMemo(() => getViewOptions(key), [getViewOptions, key]);
  const listsById = useMemo(
    () => new Map(state.lists.filter((list) => !list.deletedAt).map((list) => [list.id, list])),
    [state.lists]
  );

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sections = useCollapsedSections(key);
  /**
   * The folded group whose header the keyboard's cursor is on, in place of a
   * task. Set only by the keys; anything that puts the cursor on a task again
   * clears it.
   */
  const [foldStop, setFoldStop] = useState<string | null>(null);
  /**
   * How far ahead Today looks. Past one day it is sectioned by day, and those
   * sections stand in for Group by, which is set aside rather than changed so
   * it comes back with a one-day Today.
   */
  const [todayDays, setTodayDaysState] = useState<TodayDays>(loadTodayDays);
  const setTodayDays = (days: TodayDays) => {
    setTodayDaysState(days);
    saveTodayDays(days);
  };
  const days = mode === 'today' && !filter ? todayDays : 1;
  const byDay = days > 1;
  const [daysMenuOpen, setDaysMenuOpen] = useState(false);
  const daysBtn = useRef<View>(null);
  const [daysAnchor, setDaysAnchor] = useState<PopoverAnchor | null>(null);
  const openDaysMenu = () => {
    daysBtn.current?.measureInWindow((x, y, width, height) => {
      setDaysAnchor({ x, y, width, height });
      setDaysMenuOpen(true);
    });
  };
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Measured on press rather than on layout: the title's count can change width,
  // so a stale rect would tether the popover to where the button used to be.
  const headerMenuBtn = useRef<View>(null);
  const [optionsAnchor, setOptionsAnchor] = useState<PopoverAnchor | null>(null);
  const openHeaderMenu = () => {
    headerMenuBtn.current?.measureInWindow((x, y, width, height) => {
      setOptionsAnchor({ x, y, width, height });
      setHeaderMenuOpen(true);
    });
  };
  const enterSelectionMode = () => {
    closeOpenSwipeRow();
    setSelectionMode(true);
  };
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  // The task the right-click menu is open on. A context menu never implies a
  // selection, so this is deliberately separate from `selectedIds`.
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const [menuAt, setMenuAt] = useState<PopoverAnchor | null>(null);
  const contextTask = state.tasks.find((t) => t.id === menuTask) ?? null;
  const closeMenu = () => {
    setMenuAt(null);
    setMenuTask(null);
  };

  /**
   * The task a picker was opened for, captured when the menu handed off.
   *
   * The pickers are shared with bulk select, so they need to know which of the
   * two opened them. Reading `menuTask` directly would not do: it is cleared as
   * the menu closes, and leaving it set instead would quietly aim the next bulk
   * action at whatever was last right-clicked.
   */
  const [pickerTask, setPickerTask] = useState<string | null>(null);
  // Kept alongside it so the picker can open as a popover at the same point the
  // menu did, rather than sliding up from the bottom of the window.
  const [pickerAt, setPickerAt] = useState<PopoverAnchor | null>(null);
  const previousViewKey = useRef(key);
  /**
   * This render is the one where a different view's content first appears.
   *
   * Read during the render rather than from the effect below, because what it
   * gates has to be decided before the elements are built: the groups carry
   * layout and entering animations, and a change of view is the one case where
   * every one of them fires at once, over content nobody is comparing to what
   * was there a moment ago. It is motion that costs frames to say nothing.
   *
   * Within a view they stay: a group growing as a task lands in it, or folding
   * shut, is a change worth being able to follow.
   */
  const switchingView = previousViewKey.current !== key;

  // Native task destinations share one screen so changing lists does not mount
  // another complete drag/swipe/sheet tree. Reset the transient view state that
  // the old route change used to discard, without throwing that tree away.
  useEffect(() => {
    if (previousViewKey.current === key) return;
    previousViewKey.current = key;
    closeOpenSwipeRow();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setSelectionMode(false);
    setSelectedIds((current) => current.length > 0 ? [] : current);
    setHeaderMenuOpen(false);
    setOptionsOpen(false);
    setOptionsAnchor(null);
    setScheduleOpen(false);
    setMoveOpen(false);
    setTagOpen(false);
    setMenuTask(null);
    setMenuAt(null);
    setPickerTask(null);
    setPickerAt(null);
    setFoldStop(null);
  }, [key, scrollRef]);

  /**
   * The row the context-menu flow is currently acting on, whether that is the
   * menu itself or a picker it handed off to. Holding the highlight across both
   * lets the pointer travel row → menu → picker without losing sight of what is
   * being edited; the menu is already closed by the time a picker is up.
   */
  const contextTaskId = menuTask ?? pickerTask;
  const targetIds = pickerTask ? [pickerTask] : selectedIds;
  const pickerFor = state.tasks.find((t) => t.id === pickerTask) ?? null;
  const openPicker = (open: (v: boolean) => void) => {
    setPickerTask(menuTask);
    setPickerAt(menuAt);
    open(true);
  };
  /**
   * A picker reached from the menu can step back to it, rather than leaving
   * dismissal as the only way out of a choice you opened by mistake. Reopening
   * at the same point puts the menu back exactly where it was.
   */
  const backToMenu = (open: (v: boolean) => void) =>
    pickerTask
      ? () => {
          setMenuTask(pickerTask);
          setMenuAt(pickerAt);
          open(false);
          setPickerTask(null);
          setPickerAt(null);
        }
      : undefined;
  const closePicker = (open: (v: boolean) => void) => () => {
    open(false);
    setPickerTask(null);
    setPickerAt(null);
  };
  // Only a bulk edit has a selection to leave behind.
  const finishPickers = () => {
    if (!pickerTask) exitSelection();
    setPickerTask(null);
    setPickerAt(null);
  };

  // The Inbox tab doubles as the host for list/folder/tag filtered views, so the untriaged
  // restriction only applies when it's showing the actual Inbox.
  const untriagedOnly = mode === 'inbox' && !filter;
  const folderLists = useMemo(
    () => (filter?.type === 'folder' ? listsInFolder(state.lists, filter.value) : []),
    [filter, state.lists]
  );
  const folderListIds = useMemo(() => new Set(folderLists.map((list) => list.id)), [folderLists]);

  const { active, completed } = useMemo(() => {
    let a: Task[];
    let c: Task[];
    if (mode === 'today') {
      a = tasksDueWithin(state.tasks, now, days);
      c = completedTasksList(state.tasks).filter((t) => t.completedAt && isSameDay(new Date(t.completedAt), now));
    } else if (untriagedOnly) {
      a = inboxTasks(state.tasks);
      c = completedInboxTasks(state.tasks);
    } else {
      a = activeTasks(state.tasks);
      c = completedTasksList(state.tasks);
    }
    if (filter) {
      const matchFilter = (t: (typeof a)[number]) => {
        if (filter.type === 'list') return t.listId === filter.value;
        if (filter.type === 'folder') return !!t.listId && folderListIds.has(t.listId);
        return t.tags.includes(filter.value);
      };
      a = a.filter(matchFilter);
      c = c.filter(matchFilter);
    }
    return { active: a, completed: c };
  }, [state.tasks, mode, filter, untriagedOnly, folderListIds, days]);

  const groups = useMemo(
    () =>
      byDay
        ? groupByDay(active, options, now, days)
        : groupTasks(active, options, { lists: state.lists, folders: state.folders, now }),
    [active, options, state.lists, state.folders, byDay, days]
  );
  /** The dimension the rows are grouped by, which day sections set aside. */
  const groupDimension: GroupBy = byDay ? 'none' : options.groupBy;
  const grouped = byDay || options.groupBy !== 'none';
  /** Whether the cursor is on a folded group's header, which is still there and still folded. */
  const onFoldStop =
    foldStop !== null &&
    grouped &&
    sections.isGroupCollapsed(foldStop) &&
    groups.some((g) => g.key === foldStop && g.tasks.length > 0);

  const {
    selectedIds: webSelection,
    anchorId,
    setAnchor,
    replaceAnchor,
    select,
    clear: clearSelection,
  } = selection;

  /**
   * Whether Shift was down for the press being handled.
   *
   * Taken from the pointer event that starts the press rather than from tracked
   * key state: React Native's press events carry no modifier of their own, and
   * reading the real one leaves no window for the two to disagree — a key
   * released while the window was unfocused, say. Capture phase, so it lands
   * before the press handler asks.
   *
   * Web only: it listens on `document`, which the Mac doesn't have. There a
   * click still opens a row and makes it the anchor, and ⇧↑ and ⇧↓ extend a
   * selection from it (see `extendTo`); shift-click is not wired up yet.
   */
  const shiftHeld = useRef(false);
  /** The moving end of a keyboard selection; see `extendTo`. */
  const head = useRef<string | null>(null);
  /** Bumped to hand the keyboard to the list, on the Mac; see ListKeys. */
  const [keyFocus, setKeyFocus] = useState(0);
  const claimKeyboard = () => takeKeyboardFromSidebar(() => setKeyFocus((n) => n + 1));
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onDown = (e: PointerEvent) => {
      shiftHeld.current = e.shiftKey;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);

  const isSelected = (id: string) =>
    DESKTOP_UI ? webSelection.includes(id) : selectedIds.includes(id);

  /**
   * Rows drawn with a tint: selected, or the one the surrounding UI is about.
   *
   * The anchor keeps its tint after the detail closes: on the desktop it is the
   * keyboard's cursor and where the next shift-click measures from, and on a
   * phone it is the task last opened or added, so closing the sheet, or adding
   * a task that lands mid-list, leaves you knowing where you were. Picking
   * tasks out on a phone is its own mode, whose checkmarks say all there is.
   */
  const highlighted = (id: string) =>
    isSelected(id) ||
    contextTaskId === id ||
    openTaskId === id ||
    (anchorId === id && !onFoldStop && (DESKTOP_UI || !selectionMode));

  /** Every visible task in display order — the sequence a shift range spans. */
  const flatIds = useMemo(() => groups.flatMap((g) => g.tasks.map((t) => t.id)), [groups]);

  /**
   * Shift extends from the last row clicked on its own; anything else opens the
   * task and makes it the new anchor. Matches how a file list behaves, and means
   * selecting never needs a mode to be entered first.
   */
  const pressRow = (id: string) => {
    closeOpenSwipeRow();
    claimKeyboard();
    setFoldStop(null);
    if (!DESKTOP_UI) {
      if (selectionMode) return toggleSelected(id);
      setAnchor(id);
      openTask(id);
      return;
    }
    if (shiftHeld.current && anchorId) {
      const from = flatIds.indexOf(anchorId);
      const to = flatIds.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        select(flatIds.slice(lo, hi + 1));
        head.current = id;
        return;
      }
    }
    clearSelection();
    setAnchor(id);
    head.current = id;
    openTask(id);
  };

  /**
   * The keyboard's way through the list, on the desktop.
   *
   * The anchor is the cursor: the row a plain click last landed on, drawn with
   * its tint, which ↑ and ↓ move and the task commands act on. ⇧↑ and ⇧↓ grow
   * a selection from it, as a shift-click does, with `head` as the moving end.
   * With a selection, the task commands act on all of it instead.
   *
   * Only the rows on screen count: a folded group's are skipped, and the
   * Completed section is left out, since every task command is about open work.
   */
  const navIds = useMemo(
    () =>
      // A task under two tags is listed twice; one stop is enough.
      Array.from(
        new Set(
          groups
            .filter((g) => !(grouped && sections.isGroupCollapsed(g.key)))
            .flatMap((g) => g.tasks.map((t) => t.id))
        )
      ),
    [groups, grouped, sections.isGroupCollapsed]
  );
  const cursor = !onFoldStop && anchorId && navIds.includes(anchorId) ? anchorId : null;
  // The cursor leaves a header when it lands on a task by any other route.
  useEffect(() => setFoldStop(null), [anchorId]);
  /** The cursor's places, with folded groups' headers among the tasks; see ListStop. */
  const stops = useMemo(
    () => listStops(groups, (k) => grouped && sections.isGroupCollapsed(k)),
    [groups, grouped, sections.isGroupCollapsed]
  );
  const stopAt = onFoldStop
    ? stops.findIndex((s) => s.taskId === null && s.groupKey === foldStop)
    : cursor
      ? stops.findIndex((s) => s.taskId === cursor)
      : -1;
  // The selection is held above the screen, so only what this view shows of it
  // counts: a key must never act on a task you can't see.
  const visibleSelection = webSelection.filter((id) => navIds.includes(id));
  const commandTargets = visibleSelection.length > 0 ? visibleSelection : cursor ? [cursor] : [];
  const keyboardList = DESKTOP_UI && !selectionMode;
  /**
   * Whether an open task shows in a pane the keyboard can move into: the column
   * beside the list, or on a narrow desktop window the panel slid over it. Only
   * the phone's sheet is not one.
   */
  const taskPane = wide || FINE_POINTER;

  /** Puts the cursor on a row, and the detail with it if the detail is up beside the list. */
  const moveCursor = (id: string | null) => {
    if (!id) return;
    clearSelection();
    setAnchor(id);
    head.current = id;
    if (taskPane && openTaskId && openTaskId !== id) openTask(id);
  };
  /** Puts the cursor on a stop: a task as `moveCursor` does, or a folded group's header. */
  const moveToStop = (stop: ListStop | undefined) => {
    if (!stop) return;
    if (stop.taskId) {
      setFoldStop(null);
      moveCursor(stop.taskId);
      return;
    }
    clearSelection();
    setFoldStop(stop.groupKey);
  };
  const stepStopBy = (delta: number) => moveToStop(stops[stepStop(stops, stopAt, delta)]);
  const stepTo = (delta: 1 | -1) => stepStopBy(delta);
  /**
   * Folds or unfolds the cursor's group, as vim's `zc` and `zo`. Folding puts the
   * cursor on the group's header, so the same keys can open it again; opening
   * one from its header puts the cursor on its first task.
   */
  const fold = (collapsed: boolean | 'toggle') => {
    const stop = stops[stopAt];
    if (!grouped || !stop) return;
    const folded = sections.isGroupCollapsed(stop.groupKey);
    const next = collapsed === 'toggle' ? !folded : collapsed;
    if (next === folded) return;
    sections.setGroupsCollapsed([stop.groupKey], next);
    if (next) {
      clearSelection();
      setFoldStop(stop.groupKey);
    } else {
      const first = groups.find((g) => g.key === stop.groupKey)?.tasks[0];
      if (first) {
        setFoldStop(null);
        moveCursor(first.id);
      }
    }
  };
  /** `zM` and `zR`: every group, with the cursor kept on whatever group it was in. */
  const foldAll = (collapsed: boolean) => {
    if (!grouped) return;
    const stop = stops[stopAt];
    sections.setGroupsCollapsed(
      groups.map((g) => g.key),
      collapsed
    );
    if (!stop) return;
    if (collapsed) {
      clearSelection();
      setFoldStop(stop.groupKey);
    } else if (!stop.taskId) {
      const first = groups.find((g) => g.key === stop.groupKey)?.tasks[0];
      if (first) {
        setFoldStop(null);
        moveCursor(first.id);
      }
    }
  };
  /**
   * vim's ⌃E and ⌃Y: the list moves a row, the cursor doesn't — until it would
   * go off screen, when it comes along at the edge it went past.
   */
  const scrollLines = (lines: number) => {
    if (VIRTUALIZED) return listHandle.current?.scrollLines(lines);
    const scroller = scrollRef.current as unknown as HTMLElement | null;
    const rows = Array.from(scroller?.querySelectorAll?.<HTMLElement>('[data-task-row], [data-fold-header]') ?? []);
    if (!scroller || rows.length === 0) return;
    scroller.scrollTop += lines * rows[0].getBoundingClientRect().height;
    const view = scroller.getBoundingClientRect();
    const inView = (el: Element) => {
      const { top, bottom } = el.getBoundingClientRect();
      return top >= view.top && bottom <= view.bottom;
    };
    const current = onFoldStop
      ? scroller.querySelector(`[data-fold-header="${CSS.escape(foldStop!)}"]`)
      : cursor
        ? scroller.querySelector(`[data-task-row="${CSS.escape(cursor)}"]`)
        : null;
    if (!current || inView(current)) return;
    const visible = rows.filter(inView);
    const edge = lines > 0 ? visible[0] : visible[visible.length - 1];
    if (!edge) return;
    const taskId = edge.dataset.taskRow;
    moveToStop(
      taskId ? stops.find((s) => s.taskId === taskId) : stops.find((s) => s.taskId === null && s.groupKey === edge.dataset.foldHeader)
    );
  };
  /**
   * A task just added from this view, until the list has drawn it.
   *
   * It lands wherever the view's sort puts it, which can be well off screen,
   * so the list goes to it. It becomes the anchor, which brings it into view
   * and tints it as the last task touched; on the desktop that is the cursor,
   * so the next key acts on what was just typed. With a column beside the list
   * it opens there too, to fill in the rest; a narrow window's pane would cover
   * the field being typed into, so there only the cursor moves.
   *
   * Taken once the task is in the store, which is the add's own render. One
   * that lands in a folded group unfolds it and is taken on the next. One typed
   * into another list, date or tag never shows here, so a notice says where it
   * went instead, with a View that follows it there.
   */
  const justAdded = useRef<string | null>(null);
  useEffect(() => {
    const id = justAdded.current;
    const added = id ? state.tasks.find((t) => t.id === id) : undefined;
    if (!id || !added) return;
    justAdded.current = null;
    if (!navIds.includes(id)) {
      const folded = groups.find((g) => g.tasks.some((t) => t.id === id));
      if (folded && options.groupBy !== 'none' && sections.isGroupCollapsed(folded.key)) {
        justAdded.current = id;
        sections.toggleGroup(folded.key);
      } else {
        showAddedNotice(id, taskHome(added, state.lists).name);
      }
      return;
    }
    clearSelection();
    setAnchor(id);
    head.current = id;
    if (DESKTOP_UI && wide) openTask(id);
  }, [navIds, groups, options.groupBy, sections, state.tasks, state.lists, clearSelection, setAnchor, wide, openTask]);
  const onAdded = (id: string | undefined) => {
    if (id) justAdded.current = id;
  };
  /**
   * Brings the cursor's row into view on the web, as `VirtualTaskList` does
   * natively. The web column is fully built, so the row is always on the page
   * to find; it comes in at whichever edge it was past, the least scrolling
   * that shows it.
   *
   * A row that has only just been added isn't where it will end up yet: the
   * column places its rows itself once it has measured them, some frames
   * later, and grows to fit after that. So it is followed for a short while,
   * and brought back into view whenever it or the column moves. A row already
   * in place never moves, so scrolling away from it isn't fought.
   */
  const revealSelector = Platform.OS !== 'web'
    ? null
    : onFoldStop
    ? `[data-fold-header="${CSS.escape(foldStop!)}"]`
    : cursor
      ? `[data-task-row="${CSS.escape(cursor)}"]`
      : null;
  useEffect(() => {
    if (Platform.OS !== 'web' || !revealSelector) return;
    const scroller = scrollRef.current as unknown as HTMLElement | null;
    let frame = 0;
    let placed: string | null = null;
    const reveal = (framesLeft: number) => {
      const row = scroller?.querySelector?.(revealSelector);
      if (!scroller || !row) return;
      const view = scroller.getBoundingClientRect();
      const { top, bottom } = row.getBoundingClientRect();
      // Where the row sits in the column, which scrolling doesn't change, and
      // how tall the column is.
      const at = `${top - view.top + scroller.scrollTop}:${scroller.scrollHeight}`;
      if (at !== placed) {
        placed = at;
        const above = top - REVEAL_MARGIN - view.top;
        const below = bottom + REVEAL_MARGIN - view.bottom;
        const by = above < 0 ? above : below > 0 ? below : 0;
        if (by !== 0) scroller.scrollTop += by;
      }
      if (framesLeft > 0) frame = requestAnimationFrame(() => reveal(framesLeft - 1));
    };
    reveal(REVEAL_SETTLE_FRAMES);
    return () => cancelAnimationFrame(frame);
  }, [revealSelector, scrollRef]);
  const extendTo = (delta: 1 | -1) => {
    if (!cursor) return stepTo(delta);
    // With nothing selected the range starts here, wherever the cursor came from.
    const from = visibleSelection.length > 0 && head.current && navIds.includes(head.current) ? head.current : cursor;
    const to = stepCursor(navIds, from, delta);
    if (!to) return;
    head.current = to;
    select(rangeBetween(navIds, cursor, to));
  };
  /**
   * Where the cursor goes if the row under it leaves the view — completed,
   * trashed, or rescheduled out of Today. Taken before the act, while the row
   * after it is still known: the next one down, or up at the end of the list.
   */
  const cursorFallback = useRef<string | null>(null);
  const actOnTargets = (act: (ids: string[]) => void, clearsSelection = false) => {
    const ids = commandTargets;
    if (ids.length === 0) return;
    const gone = new Set(ids);
    const last = Math.max(...ids.map((id) => navIds.indexOf(id)));
    cursorFallback.current =
      navIds.slice(last + 1).find((id) => !gone.has(id)) ??
      navIds.slice(0, last).reverse().find((id) => !gone.has(id)) ??
      null;
    act(ids);
    if (clearsSelection) clearSelection();
  };
  useEffect(() => {
    // Read once, on the first change of rows after the act; an act that left
    // the row where it was has nothing to correct.
    const fallback = cursorFallback.current;
    cursorFallback.current = null;
    if (!fallback || !anchorId || navIds.includes(anchorId) || !navIds.includes(fallback)) return;
    setAnchor(fallback);
    head.current = fallback;
    // The detail beside the list was showing the row that left; it follows.
    if (taskPane && openTaskId === anchorId) openTask(fallback);
  }, [navIds, anchorId, setAnchor, taskPane, openTaskId, openTask]);

  /**
   * Takes the keyboard for the list, from the add field's Escape or Down, or a
   * Tab or Escape in the task pane. The cursor comes too: onto the task open
   * beside the list if there is one, else the first row, so ↑ and ↓ have
   * somewhere to start.
   *
   * That default is only for a list with no cursor, and this can run before
   * the list has drawn the one it was just given: Go to Task… sets the cursor,
   * changes list and asks for the keyboard in one go. So it replaces only the
   * anchor this render saw, never one set since.
   */
  const focusList = () => {
    if (!cursor) {
      const start = openTaskId && navIds.includes(openTaskId) ? openTaskId : navIds[0];
      if (start) {
        replaceAnchor(anchorId, start);
        head.current = start;
      }
    }
    releaseWebField();
    claimKeyboard();
  };
  usePaneFocus('list', focusList, keyboardList);
  const listHasKeyboard = useListHasKeyboard();
  useCommand('nextPane', () => focusNextPane('list', 1), keyboardList);
  useCommand('previousPane', () => focusNextPane('list', -1), keyboardList);

  const hasRows = keyboardList && stops.length > 0;
  const hasTargets = keyboardList && commandTargets.length > 0;
  useCommand('nextTask', () => stepTo(1), hasRows);
  useCommand('previousTask', () => stepTo(-1), hasRows);
  useCommand('selectNext', () => extendTo(1), hasRows);
  useCommand('selectPrevious', () => extendTo(-1), hasRows);
  useCommand('openTask', () => cursor && openTask(cursor), keyboardList && !!cursor);
  /**
   * Return opens the task to edit it: the pane opens, or follows, and the
   * caret goes into its title, so editing is Return, type, Escape. A pane
   * for another task remounts for this one, so the focus waits for it.
   */
  const editCursor = () => {
    if (!cursor) return;
    // A phone opens it as a sheet instead, with no pane to go into.
    if (openTaskId === cursor) {
      // The pane follows the cursor a little behind, so it may still be the
      // last task's; the keyboard waits for this one's.
      if (taskPane) focusPane('pane', { key: cursor });
      return;
    }
    openTask(cursor);
    if (taskPane) focusPane('pane', { mounting: true });
  };
  useCommand('editTask', editCursor, keyboardList && !!cursor);
  useCommand('focusTaskPane', editCursor, keyboardList && !!cursor);
  // A narrow window keeps its sidebar in the drawer: the key opens it and the
  // keyboard follows once it has mounted.
  const focusSidebar = () => {
    if (wide) return focusPane('sidebar');
    openDrawer();
    if (!focusPane('sidebar')) focusPane('sidebar', { mounting: true });
  };
  useCommand('focusSidebar', focusSidebar, keyboardList);
  const hasStops = keyboardList && stops.length > 0;
  useCommand('firstTask', () => stepStopBy(-stops.length), hasStops);
  useCommand('lastTask', () => stepStopBy(stops.length), hasStops);
  useCommand('pageDown', () => stepStopBy(PAGE_ROWS), hasStops);
  useCommand('pageUp', () => stepStopBy(-PAGE_ROWS), hasStops);
  useCommand('nextGroup', () => moveToStop(stops[groupStop(stops, stopAt, 1)]), hasStops);
  useCommand('previousGroup', () => moveToStop(stops[groupStop(stops, stopAt, -1)]), hasStops);
  useCommand('scrollLineDown', () => scrollLines(1), hasStops);
  useCommand('scrollLineUp', () => scrollLines(-1), hasStops);
  const canFold = hasStops && grouped && stopAt !== -1;
  useCommand('toggleFold', () => fold('toggle'), canFold);
  useCommand('openFold', () => fold(false), canFold);
  useCommand('closeFold', () => fold(true), canFold);
  useCommand('openAllFolds', () => foldAll(false), hasStops && grouped);
  useCommand('closeAllFolds', () => foldAll(true), hasStops && grouped);
  /** View ▸ Toggle Task Pane: closes the task beside the list, or opens the cursor's. */
  useCommand(
    'toggleTaskPane',
    () => {
      if (openTaskId) {
        closeTask();
        claimKeyboard();
      } else if (cursor) openTask(cursor);
    },
    keyboardList && (!!openTaskId || !!cursor)
  );
  /**
   * Escape backs out one step: a selection first, then the task open beside the
   * list, as the pane's close button would. The row keeps its tint as the cursor,
   * so ↑ and ↓ carry on from where it was, and the list takes the keyboard back
   * from a field in the pane that just went away.
   */
  const backOut = () => {
    if (webSelection.length > 0) return clearSelection();
    if (!openTaskId) return;
    if (navIds.includes(openTaskId)) {
      setAnchor(openTaskId);
      head.current = openTaskId;
    }
    closeTask();
    claimKeyboard();
  };
  useCommand('deselect', backOut, keyboardList && (webSelection.length > 0 || !!openTaskId));
  useCommand(
    'completeTask',
    () =>
      actOnTargets((ids) => {
        // Through toggleComplete one at a time, as the bulk bar does, so each
        // gets its sound and the last one its undo.
        for (const id of ids) {
          if (!state.tasks.find((t) => t.id === id)?.completed) toggleComplete(id);
        }
      }, true),
    hasTargets
  );
  useCommand('dueToday', () => actOnTargets((ids) => ids.forEach(scheduleToday)), hasTargets);
  useCommand('dueTomorrow', () => actOnTargets((ids) => ids.forEach(snoozeTask)), hasTargets);
  useCommand(
    'clearDue',
    () => actOnTargets((ids) => bulkUpdate(ids, { dueDate: undefined, dueTime: undefined })),
    hasTargets
  );
  useCommand('priorityHigh', () => actOnTargets((ids) => bulkUpdate(ids, { priority: 'high' })), hasTargets);
  useCommand('priorityMedium', () => actOnTargets((ids) => bulkUpdate(ids, { priority: 'medium' })), hasTargets);
  useCommand('priorityLow', () => actOnTargets((ids) => bulkUpdate(ids, { priority: 'low' })), hasTargets);
  useCommand('priorityNone', () => actOnTargets((ids) => bulkUpdate(ids, { priority: 'none' })), hasTargets);
  useCommand('deleteTask', () => actOnTargets(deleteTasks, true), hasTargets);
  useCommand(
    'trashKeyHint',
    () => showKeyHint(`Press ${formatShortcut(commandDef('deleteTask').listKeys![0], MAC_KEYS)} to move to Trash`),
    hasTargets
  );
  // Pickers in the command menu, for the tasks the commands act on now: what
  // was chosen in the list before the menu came up.
  useCommand('moveToList', () => showPalettePicker({ kind: 'moveToList', taskIds: commandTargets }), hasTargets);
  useCommand('editTags', () => showPalettePicker({ kind: 'editTags', taskIds: commandTargets }), hasTargets);

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelected = (id: string) => {
    hapticSelect();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allSelected = selectedIds.length > 0 && selectedIds.length === active.length;
  const customised = options.groupBy !== 'none' || options.sortBy !== 'manual';
  const headerActions: MenuAction[] = [
    {
      id: 'options',
      title: 'Group & sort',
      image: 'line.3.horizontal.decrease',
      imageColor: customised ? accent : undefined,
    },
    { id: 'select', title: 'Select tasks', image: 'checkmark.circle' },
  ];

  // New tasks inherit whatever dimension this view is scoped to. A folder has
  // no task id of its own, so its first list is the predictable destination and
  // is named in the composer; explicit typed or picked lists still win.
  const quickAddDefaults = ((): QuickAddDefaults | undefined => {
    if (filter?.type === 'list') return { listId: filter.value };
    if (filter?.type === 'folder' && folderLists[0]) return { listId: folderLists[0].id };
    if (filter?.type === 'tag') return { tags: [filter.value] };
    if (mode === 'today') return { dueDate: toISODate(now) };
    return undefined;
  })();
  const canQuickAdd = filter?.type !== 'folder' || folderLists.length > 0;

  // The list scrolls to the screen edge with both the tab bar and the FAB
  // standing on it, so the last row has to come out from under the pair. Applied
  // whether or not the button is up, so entering selection mode — which hides it
  // — doesn't shift the rows underneath the finger that started it. A narrow Mac
  // window has the floating tab bar but types into the pinned field, so there
  // it clears the bar alone.
  const bottomChrome = nativeTabBarClearance(insets.bottom) + (DESKTOP_UI ? 0 : NATIVE_FAB_CLEARANCE);
  const quickAddLabel =
    filter?.type === 'folder' ? folderLists[0]?.name : filter ? filter.label : mode === 'today' ? 'Today' : undefined;

  // A filtered view implies its list/tag on every row; so does a group header when
  // grouping by the same dimension. The group wins, since it's the narrower scope.
  const filterHideListId = filter?.type === 'list' ? filter.value : undefined;
  const filterHideTag = filter?.type === 'tag' ? filter.value : undefined;

  const groupHide = (groupKey: string) => ({
    hideListId:
      groupDimension === 'list' && groupKey !== INBOX_GROUP_KEY ? groupKey : filterHideListId,
    hideTag:
      groupDimension === 'tag' && groupKey.startsWith('tag:') ? groupKey.slice(4) : filterHideTag,
  });

  // Every view is draggable. Under a sort the drag wins rather than being undone
  // by the comparator: the view remembers that its order was customised and offers
  // to restore the sort, instead of the drop rewriting the task to match where it
  // landed.
  const canReorder = !selectionMode;

  const handleReorder = (
    groupKey: string,
    nextIds: string[],
    moved: { id: string; prevId: string | null; nextId: string | null }
  ) => {
    // Grabbing a row that is part of a selection drags the whole selection to
    // where it lands; grabbing anything else drops the selection first, so a
    // stray drag can never quietly rearrange rows you had picked out earlier.
    const group = groups.find((g) => g.key === groupKey);
    const dragged = isSelected(moved.id) ? webSelection : [];
    const movingIds =
      dragged.length > 1 && group
        ? group.tasks.filter((t) => dragged.includes(t.id)).map((t) => t.id)
        : [moved.id];
    if (movingIds.length === 1 && webSelection.length > 0 && !isSelected(moved.id)) {
      clearSelection();
    }

    // The library reports the neighbours of the one row it dragged, which may
    // themselves be moving. Re-derive them from the sequence with the whole
    // group taken out, so they are the rows the group is landing between.
    const moving = new Set(movingIds);
    const remaining = nextIds.filter((id) => !moving.has(id));
    const at = nextIds.slice(0, nextIds.indexOf(moved.id)).filter((id) => !moving.has(id)).length;
    const prevId = remaining[at - 1] ?? null;
    const nextId = remaining[at] ?? null;

    // Custom order is a property of the tasks themselves. Every other sort
    // records the arrangement against this view and group instead, leaving the
    // tasks — and so every other view — untouched.
    if (options.sortBy === 'manual') reorderTasks(movingIds, prevId, nextId);
    else {
      const sequence = [...remaining.slice(0, at), ...movingIds, ...remaining.slice(at)];
      setArrangement(key, options.sortBy, groupKey, sequence);
    }
  };

  /**
   * Nothing below the list is built until something has asked for it. See
   * `useLazyMount`: these are all overlays, and a screen that has just opened
   * has none of them up.
   */
  const optionsMounted = useLazyMount(optionsOpen);
  const contextMenuMounted = useLazyMount(!!menuAt);
  const scheduleMounted = useLazyMount(scheduleOpen);
  const moveMounted = useLazyMount(moveOpen);
  const tagMounted = useLazyMount(tagOpen);
  const headerMenuMounted = useLazyMount(headerMenuOpen);
  const daysMenuMounted = useLazyMount(daysMenuOpen);

  const restoreSort = () => clearArrangement(key, options.sortBy);

  /** What choosing in Group & sort does, for the sheet and for View ▸ Group By / Sort By alike. */
  const changeViewOptions = (next: ViewOptions) => {
    if (
      next.groupBy === options.groupBy &&
      next.sortBy === options.sortBy &&
      next.arrangements === options.arrangements
    ) {
      return;
    }
    setViewOptions(key, next);
    // Sort changes retain the same sections, so there is nothing to reset
    // or persist. A new grouping dimension gets a clean expanded view.
    if (next.groupBy !== options.groupBy) sections.expandAllGroups();
  };
  const groupBy = (value: GroupBy) => () => changeViewOptions({ ...options, groupBy: value });
  const sortBy = (value: SortBy) => () => changeViewOptions({ ...options, sortBy: value });
  // Day sections are the grouping while Today covers several days.
  useCommand('groupByNone', groupBy('none'), !byDay, options.groupBy === 'none');
  useCommand('groupByList', groupBy('list'), !byDay, options.groupBy === 'list');
  useCommand('groupByDate', groupBy('date'), !byDay, options.groupBy === 'date');
  useCommand('groupByTag', groupBy('tag'), !byDay, options.groupBy === 'tag');
  useCommand('groupByPriority', groupBy('priority'), !byDay, options.groupBy === 'priority');
  useCommand('sortByManual', sortBy('manual'), true, options.sortBy === 'manual');
  useCommand('sortByDate', sortBy('date'), true, options.sortBy === 'date');
  useCommand('sortByTitle', sortBy('title'), true, options.sortBy === 'title');
  useCommand('sortByTag', sortBy('tag'), true, options.sortBy === 'tag');
  useCommand('sortByPriority', sortBy('priority'), true, options.sortBy === 'priority');

  const renderTaskCard = (group: TaskGroup) => {
    const tasks = group.tasks;
    const hide = groupHide(group.key);
    return (
    <Card style={{ marginHorizontal: 12 }}>
      <DragList
        items={tasks}
        keyExtractor={(task) => task.id}
        enabled={canReorder}
        immediateChanges
        scrollableRef={scrollRef}
        onReorder={(ids, moved) => handleReorder(group.key, ids, moved)}
        dragCount={(id) => (isSelected(id) ? webSelection.length : 1)}
        renderItem={(task, i) => (
          <ContextMenuTarget
            // How the cursor's row is found to bring it into view.
            dataSet={{ taskRow: task.id }}
            onOpen={(pos) => {
              setMenuTask(task.id);
              setMenuAt({ x: pos.x, y: pos.y, width: 0, height: 0 });
            }}
          >
            <TaskRow
              task={task}
              list={task.listId ? listsById.get(task.listId) : undefined}
              now={now}
              selectionMode={selectionMode}
              active={highlighted(task.id) && !isSelected(task.id)}
              muted={!listHasKeyboard && highlighted(task.id)}
              handleGutter={canReorder && FINE_POINTER}
              showContext={rowContext}
              hideListId={hide.hideListId}
              hideTag={hide.hideTag}
              selected={isSelected(task.id)}
              onPress={() => pressRow(task.id)}
              onToggleComplete={() => toggleComplete(task.id)}
              onToday={() => scheduleToday(task.id)}
              onLater={() => snoozeTask(task.id)}
              onNextWeek={() => scheduleNextWeek(task.id)}
            />
            {i < tasks.length - 1 &&
              (() => {
                const next = tasks[i + 1];
                // The divider is inset and drawn on the card, so beside a tinted
                // row it leaves a band of card that reads as a half-drawn line.
                // Any divider touching one squares off to the full width; one
                // between two selected rows also takes the tint, so a run of
                // them closes up into a single block.
                const touching = highlighted(task.id) || highlighted(next.id);
                const within = isSelected(task.id) && isSelected(next.id);
                return (
                  <Divider
                    indent={touching ? 0 : undefined}
                    color={within ? colors.selectedRowBg : undefined}
                    railColor={task.listId ? listsById.get(task.listId)?.color : undefined}
                  />
                );
              })()}
          </ContextMenuTarget>
        )}
      />
    </Card>
    );
  };

  /**
   * The same row and divider as `renderTaskCard` and the completed card, for the
   * virtualized list, which lays them out itself. A group's hide rules follow
   * the group the row is drawn under, since a task under two tags appears once
   * in each.
   *
   * Both keep their identity across a move of the cursor, which is what lets
   * the list skip every cell the cursor didn't touch (see `TaskCell`). So what
   * the cursor and selection say about a row arrives as its `mark`, never by
   * reading them here; and since a skipped cell keeps the handlers it was last
   * given, those reach this render's functions through `live` rather than
   * closing over an older render's.
   */
  const live = useRef({
    pressRow,
    toggleSelected,
    openTask,
    toggleComplete,
    scheduleToday,
    snoozeTask,
    scheduleNextWeek,
    selectionMode,
    isSelected,
    selectionCount: webSelection.length,
  });
  live.current = {
    pressRow,
    toggleSelected,
    openTask,
    toggleComplete,
    scheduleToday,
    snoozeTask,
    scheduleNextWeek,
    selectionMode,
    isSelected,
    selectionCount: webSelection.length,
  };
  // A row only reads the day, so the renderers below change at midnight, not
  // with each render's clock.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const rowNow = useMemo(() => new Date(today), [today]);
  const groupByDimension = groupDimension;
  const handleGutter = canReorder && FINE_POINTER;

  const rowMark = (id: string, groupKey: string | null) => {
    if (groupKey === null) {
      // A completed row is only ever marked by the phone's select mode, or by
      // being the task that is open.
      return (openTaskId === id ? ROW_HIGHLIGHTED : 0) | (selectedIds.includes(id) ? ROW_SELECTED : 0);
    }
    const lit = highlighted(id);
    return (
      (lit ? ROW_HIGHLIGHTED : 0) |
      (isSelected(id) ? ROW_SELECTED : 0) |
      (lit && !listHasKeyboard ? ROW_MUTED : 0)
    );
  };

  const renderVirtualRow = useCallback(
    (task: Task, { groupKey, drag, mark }: RowRenderInfo) => {
      const selected = (mark & ROW_SELECTED) !== 0;
      const active = (mark & ROW_HIGHLIGHTED) !== 0 && !selected;
      if (groupKey === null) {
        return (
          <TaskRow
            task={task}
            list={task.listId ? listsById.get(task.listId) : undefined}
            now={rowNow}
            selectionMode={selectionMode}
            active={active}
            showContext={rowContext}
            selected={selected}
            onPress={() =>
              live.current.selectionMode ? live.current.toggleSelected(task.id) : live.current.openTask(task.id)
            }
            onToggleComplete={() => live.current.toggleComplete(task.id)}
            onToday={() => live.current.scheduleToday(task.id)}
            onLater={() => live.current.snoozeTask(task.id)}
            onNextWeek={() => live.current.scheduleNextWeek(task.id)}
          />
        );
      }
      return (
        <ContextMenuTarget
          onOpen={(pos) => {
            setMenuTask(task.id);
            setMenuAt({ x: pos.x, y: pos.y, width: 0, height: 0 });
          }}
        >
          <TaskRow
            task={task}
            list={task.listId ? listsById.get(task.listId) : undefined}
            now={rowNow}
            selectionMode={selectionMode}
            active={active}
            muted={(mark & ROW_MUTED) !== 0}
            handleGutter={handleGutter}
            showContext={rowContext}
            hideListId={
              groupByDimension === 'list' && groupKey !== INBOX_GROUP_KEY ? groupKey : filterHideListId
            }
            hideTag={
              groupByDimension === 'tag' && groupKey.startsWith('tag:') ? groupKey.slice(4) : filterHideTag
            }
            selected={selected}
            onPress={() => live.current.pressRow(task.id)}
            onLongPress={drag}
            onToggleComplete={() => live.current.toggleComplete(task.id)}
            onToday={() => live.current.scheduleToday(task.id)}
            onLater={() => live.current.snoozeTask(task.id)}
            onNextWeek={() => live.current.scheduleNextWeek(task.id)}
          />
        </ContextMenuTarget>
      );
    },
    [
      listsById,
      rowNow,
      selectionMode,
      rowContext,
      handleGutter,
      groupByDimension,
      filterHideListId,
      filterHideTag,
    ]
  );
  const selectedRowBg = colors.selectedRowBg;
  const renderVirtualDivider = useCallback(
    (task: Task, _next: Task, done: boolean, mark: number, nextMark: number) => {
      const railColor = task.listId ? listsById.get(task.listId)?.color : undefined;
      if (done) return <Divider railColor={railColor} />;
      const touching = ((mark | nextMark) & ROW_HIGHLIGHTED) !== 0;
      const within = (mark & nextMark & ROW_SELECTED) !== 0;
      return (
        <Divider
          indent={touching ? 0 : undefined}
          color={within ? selectedRowBg : undefined}
          railColor={railColor}
        />
      );
    },
    [listsById, selectedRowBg]
  );
  const virtualDragCount = useCallback(
    (id: string) => (live.current.isSelected(id) ? live.current.selectionCount : 1),
    []
  );

  // The Agenda's title is its range, and choosing another range is done on the
  // title itself, so the two can never disagree.
  const daysLabel = (
    <View style={styles.daysLabel}>
      <Text style={styles.title} numberOfLines={1}>
        {TODAY_DAYS_LABEL[todayDays]}
      </Text>
      <IconChevronDown size={14} color={colors.textTertiary} />
    </View>
  );
  // A menu rather than a cycling button: the choice is how far ahead to look,
  // and stepping through every length to get back to one is a detour.
  const daysControl = DESKTOP_UI ? (
    <Pressable
      ref={daysBtn}
      onPress={openDaysMenu}
      accessibilityRole="button"
      accessibilityLabel="Days shown"
      style={styles.daysButton}
    >
      {daysLabel}
    </Pressable>
  ) : (
    <MenuView
      actions={TODAY_DAYS_OPTIONS.map((d) => ({
        id: String(d),
        title: TODAY_DAYS_LABEL[d],
        state: d === todayDays ? 'on' : 'off',
      }))}
      onPressAction={({ nativeEvent }) => setTodayDays(Number(nativeEvent.event) as TodayDays)}
    >
      <View accessible accessibilityRole="button" accessibilityLabel="Days shown">
        {daysLabel}
      </View>
    </MenuView>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      {selectionMode ? (
        <View style={[styles.selectHeader, wide && styles.paneWide]}>
          <GlassTextButton
            onPress={() => setSelectedIds(allSelected ? [] : active.map((t) => t.id))}
            label={allSelected ? 'Deselect all tasks' : 'Select all tasks'}
          >
            <Text style={[styles.headerAction, { color: accent }]}>{allSelected ? 'None' : 'All'}</Text>
          </GlassTextButton>
          <Text style={styles.selectedCount}>{selectedIds.length} selected</Text>
          <GlassTextButton onPress={exitSelection} label="Cancel selection">
            <Text style={[styles.headerAction, { color: accent }]}>Cancel</Text>
          </GlassTextButton>
        </View>
      ) : (
        <View style={[styles.header, wide && styles.paneWide]}>
          {!wide && (
            <GlassIconButton onPress={openDrawer} label="Menu" shortcut="toggleSidebar">
              <IconMenu />
            </GlassIconButton>
          )}
          <View style={styles.titleRow}>
            {mode === 'today' && !filter ? (
              daysControl
            ) : (
              <Text style={styles.title} numberOfLines={1}>
                {filter ? filter.label : TITLES[mode]}
              </Text>
            )}
            <Text style={styles.count}>{active.length}</Text>
          </View>
          {DESKTOP_UI ? (
            <Tooltip label="More">
              <GlassIconButton ref={headerMenuBtn} onPress={openHeaderMenu} label="More actions">
                <IconDotsHorizontal size={FINE_POINTER ? 17 : 22} />
              </GlassIconButton>
            </Tooltip>
          ) : (
            <MenuView
              actions={headerActions}
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === 'options') setOptionsOpen(true);
                if (nativeEvent.event === 'select') enterSelectionMode();
              }}
            >
              <GlassIconMenuLabel label="More actions">
                <IconDotsHorizontal size={FINE_POINTER ? 17 : 22} />
              </GlassIconMenuLabel>
            </MenuView>
          )}
        </View>
      )}

      {/* Outside the ScrollView so it stays put instead of scrolling away. */}
      {DESKTOP_UI && !selectionMode && canQuickAdd && (
        <View style={[styles.quickAddBand, wide && styles.paneWide]}>
          <QuickAddBar
            defaults={quickAddDefaults}
            onAdded={onAdded}
            contextLabel={quickAddLabel}
          />
        </View>
      )}

      <ListKeys focusKey={keyFocus}>
      {VIRTUALIZED ? (
        <VirtualTaskList
          ref={listRef}
          groups={groups}
          grouped={grouped}
          completed={completed}
          isGroupCollapsed={sections.isGroupCollapsed}
          toggleGroup={sections.toggleGroup}
          completedCollapsed={sections.completedCollapsed}
          toggleCompleted={sections.toggleCompleted}
          emptyText="Nothing here. Nice work."
          dragEnabled={canReorder}
          animateLayout={!switchingView}
          renderRow={renderVirtualRow}
          renderDivider={renderVirtualDivider}
          rowMark={rowMark}
          onReorder={handleReorder}
          dragCount={DESKTOP_UI ? virtualDragCount : undefined}
          refreshControl={refreshControl}
          onScrollBeginDrag={closeOpenSwipeRow}
          revealTaskId={cursor}
          cursorGroup={onFoldStop ? foldStop : null}
          cursorMuted={!listHasKeyboard}
          handleRef={listHandle}
          onCursorScrolledOff={moveToStop}
          contentContainerStyle={[
            styles.listContent,
            !DESKTOP_UI && styles.scrollContentFab,
            FLOATING_TAB_BAR && !wide && { paddingBottom: bottomChrome },
            wide && styles.paneWide,
          ]}
        />
      ) : (
        <Animated.ScrollView
          ref={scrollRef}
          refreshControl={refreshControl}
          // Scrolling away from an open row is how you dismiss it everywhere else.
          onScrollBeginDrag={closeOpenSwipeRow}
          contentContainerStyle={[
            styles.scrollContent,
            !DESKTOP_UI && styles.scrollContentFab,
            FLOATING_TAB_BAR && !wide && { paddingBottom: bottomChrome },
            wide && styles.paneWide,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {active.length === 0 && <Text style={styles.empty}>Nothing here. Nice work.</Text>}

          {active.length > 0 &&
            (grouped ? (
              groups.map((group) => {
                const collapsed = sections.isGroupCollapsed(group.key);
                return (
                  <Animated.View
                    key={group.key}
                    layout={switchingView ? undefined : GROUP_LAYOUT}
                    style={styles.group}
                  >
                    <View
                      style={{ marginHorizontal: 6 }}
                      // How a folded header holding the cursor is found to bring it into view.
                      {...({ dataSet: collapsed ? { foldHeader: group.key } : undefined } as object)}
                    >
                      <SectionHeader
                        label={group.label}
                        count={group.tasks.length}
                        color={group.color}
                        collapsed={collapsed}
                        onToggle={() => sections.toggleGroup(group.key)}
                        current={onFoldStop && foldStop === group.key}
                        muted={!listHasKeyboard}
                      />
                    </View>
                    {!collapsed && group.tasks.length > 0 && (
                      <Animated.View
                        entering={switchingView ? undefined : GROUP_ENTER}
                        layout={switchingView ? undefined : GROUP_LAYOUT}
                      >
                        {renderTaskCard(group)}
                      </Animated.View>
                    )}
                  </Animated.View>
                );
              })
            ) : (
              renderTaskCard(groups[0])
            ))}

          {completed.length > 0 && (
            <Animated.View layout={switchingView ? undefined : GROUP_LAYOUT}>
              <View style={{ marginHorizontal: 6 }}>
                <SectionHeader
                  label={`Completed · ${completed.length}`}
                  collapsed={sections.completedCollapsed}
                  onToggle={sections.toggleCompleted}
                />
              </View>
              {!sections.completedCollapsed && (
                <Animated.View
                  entering={switchingView ? undefined : GROUP_ENTER}
                  layout={switchingView ? undefined : GROUP_LAYOUT}
                >
                  <Card style={{ marginHorizontal: 12 }}>
                    {completed.map((task, i) => (
                      <View key={task.id}>
                        <TaskRow
                          task={task}
                          list={task.listId ? listsById.get(task.listId) : undefined}
                          now={now}
                          selectionMode={selectionMode}
                          active={openTaskId === task.id && !selectedIds.includes(task.id)}
                          showContext={rowContext}
                          selected={selectedIds.includes(task.id)}
                          onPress={() =>
                            selectionMode ? toggleSelected(task.id) : openTask(task.id)
                          }
                          onToggleComplete={() => toggleComplete(task.id)}
                          onToday={() => scheduleToday(task.id)}
                          onLater={() => snoozeTask(task.id)}
                          onNextWeek={() => scheduleNextWeek(task.id)}
                        />
                        {i < completed.length - 1 && (
                          <Divider railColor={task.listId ? listsById.get(task.listId)?.color : undefined} />
                        )}
                      </View>
                    ))}
                  </Card>
                </Animated.View>
              )}
            </Animated.View>
          )}
        </Animated.ScrollView>
      )}
      </ListKeys>

      {!DESKTOP_UI && canQuickAdd && (
        <AddTaskFab
          defaults={quickAddDefaults}
          contextLabel={quickAddLabel}
          hidden={selectionMode}
          onAdded={onAdded}
        />
      )}

      {selectionMode && (
        <BulkActionBar
          onSchedule={() => setScheduleOpen(true)}
          onMove={() => setMoveOpen(true)}
          onTag={() => setTagOpen(true)}
          onDelete={() => {
            deleteTasks(selectedIds);
            exitSelection();
          }}
        />
      )}

      {DESKTOP_UI && headerMenuMounted && (
        <Popover
          visible={headerMenuOpen}
          onClose={() => setHeaderMenuOpen(false)}
          anchor={optionsAnchor}
          width={220}
        >
          <MenuRow
            icon={<IconViewOptions size={16} color={customised ? accent : undefined} />}
            label="Group & sort"
            onPress={() => {
              setHeaderMenuOpen(false);
              setOptionsOpen(true);
            }}
          />
          {/* Selecting on the web is shift-click, so it needs no menu action. */}
        </Popover>
      )}

      {DESKTOP_UI && daysMenuMounted && (
        <Popover visible={daysMenuOpen} onClose={() => setDaysMenuOpen(false)} anchor={daysAnchor} width={160}>
          {TODAY_DAYS_OPTIONS.map((d) => (
            <MenuRow
              key={d}
              icon={d === todayDays ? <IconCheckBig size={14} color={accent} /> : null}
              label={TODAY_DAYS_LABEL[d]}
              onPress={() => {
                setDaysMenuOpen(false);
                setTodayDays(d);
              }}
            />
          ))}
        </Popover>
      )}

      {optionsMounted && (
      <ViewOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        value={options}
        onChange={changeViewOptions}
        onRestore={restoreSort}
        anchor={optionsAnchor}
        showGroupBy={!byDay}
      />
      )}

      {contextMenuMounted && (
      <TaskContextMenu
        task={contextTask}
        at={menuAt}
        onClose={closeMenu}
        onPatch={(patch) => contextTask && updateTask(contextTask.id, patch)}
        onPickDate={() => openPicker(setScheduleOpen)}
        onMove={() => openPicker(setMoveOpen)}
        onTags={() => openPicker(setTagOpen)}
        onToggleComplete={() => contextTask && toggleComplete(contextTask.id)}
        onSkip={() => contextTask && skipOccurrence(contextTask.id)}
        onDelete={() => contextTask && deleteTasks([contextTask.id])}
      />
      )}

      {scheduleMounted && (
      <DueDatePickerSheet
        visible={scheduleOpen}
        onClose={closePicker(setScheduleOpen)}
        anchor={pickerAt}
        onBack={backToMenu(setScheduleOpen)}
        onApply={(dueDate, dueTime) => {
          bulkUpdate(targetIds, { dueDate, dueTime });
          finishPickers();
        }}
      />
      )}
      {moveMounted && (
      <ListPickerSheet
        visible={moveOpen}
        onClose={closePicker(setMoveOpen)}
        anchor={pickerAt}
        onBack={backToMenu(setMoveOpen)}
        value={pickerFor?.listId ?? null}
        onApply={(listId) => {
          bulkUpdate(targetIds, { listId });
          finishPickers();
        }}
      />
      )}
      {tagMounted && (
      <TagPickerSheet
        visible={tagOpen}
        onClose={closePicker(setTagOpen)}
        anchor={pickerAt}
        onBack={backToMenu(setTagOpen)}
        initialTags={pickerFor?.tags ?? []}
        onApply={(tags) => {
          targetIds.forEach((id) => {
            const t = state.tasks.find((x) => x.id === id);
            if (t) bulkUpdate([id], { tags: Array.from(new Set([...t.tags, ...tags])) });
          });
          finishPickers();
        }}
      />
      )}
    </View>
  );
  },
  // Held still while behind another screen; coming to the front is itself a
  // change, so it catches up on whatever it missed in that one render.
  (prev, next) =>
    prev.mode === next.mode &&
    sameFilter(prev.filter, next.filter) &&
    prev.focused === next.focused &&
    (!next.focused || (prev.detail === next.detail && prev.selection === next.selection))
);

const useStyles = makeStyles((c) => ({
  screen: {
    flex: 1,
    backgroundColor: c.screenBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FINE_POINTER ? 10 : 12,
    paddingHorizontal: FINE_POINTER ? 12 : 16,
    paddingBottom: FINE_POINTER ? 6 : 10,
    // Lifts the whole bar over the quick-add field below it. A tooltip hangs
    // under its button and so leaves the header's bounds; without this the
    // field, being a later sibling, paints straight over it.
    zIndex: 1,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontFamily: FINE_POINTER ? fonts.sansSemiBold : fonts.sansBold,
    fontSize: FINE_POINTER ? 16 : 22,
    color: c.textPrimary,
  },
  count: {
    fontFamily: fonts.monoRegular,
    fontSize: FINE_POINTER ? 12 : 13.5,
    color: c.textTertiary,
  },
  daysLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  daysButton: {
    flexShrink: 1,
  },
  selectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerAction: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  selectedCount: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.textPrimary,
  },
  scrollContent: {
    /**
     * Stretches the content to the viewport when there is less than a screenful
     * of it, so the scrollable area reaches the bottom instead of ending under
     * the last row.
     *
     * The ScrollView's own frame already fills the screen — RN gives it
     * `flexGrow: 1` in its base style. What stops short is the content inside
     * it, and the content is what you can pull on: below it the drag finds the
     * frame's empty backing rather than anything scrollable, so pull-to-refresh
     * only answers in the band the rows happen to occupy. On a list with two
     * tasks that is a couple of hundred points at the top of an otherwise
     * reachable screen.
     *
     * `flexGrow` rather than `flex`, and on the content rather than the frame:
     * a full screenful must still be free to run past the bottom and scroll.
     */
    flexGrow: 1,
    paddingBottom: 24,
    gap: 12,
  },
  /**
   * `scrollContent` without the gap: the virtualized list's children are its
   * rows, and the spacing between groups is drawn by their headers instead.
   */
  listContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  /** Clears the floating button so it never covers the last row. */
  scrollContentFab: {
    paddingBottom: 96,
  },
  quickAddBand: {
    paddingBottom: 2,
    // Over the list below it, which the chips' tooltips hang down into.
    zIndex: 1,
  },
  group: {
    gap: 2,
  },
  /** Keeps the list at a readable width instead of stretching across a desktop window. */
  paneWide: {
    width: '100%',
    maxWidth: PANE_MAX_WIDTH,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
}));

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
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
  tasksDueByToday,
} from '../data/selectors';
import { isSameDay, toISODate } from '../data/dateUtils';
import { QuickAddDefaults } from '../data/TaskContext';
import { hapticSelect } from '../data/haptics';
import { useSyncRefresh } from '../data/useSyncRefresh';
import { FINE_POINTER, WEB_ENTRY } from '../data/platform';
import { INBOX_GROUP_KEY, TaskGroup, groupTasks, hasArrangement, viewKey } from '../data/viewOptions';
import { useCollapsedSections } from '../data/uiPrefs';
import { Task } from '../data/types';
import { TaskListFilter } from '../navigation/types';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { NATIVE_FAB_CLEARANCE, nativeTabBarClearance } from '../navigation/nativeTabBarLayout';
import { useDetail } from '../navigation/DetailContext';
import { useSelection } from '../navigation/SelectionContext';
import TaskRow from '../components/TaskRow';
import { useRowContext } from '../components/useRowContext';
import Card from '../components/Card';
import Divider from '../components/Divider';
import DragList from '../components/DragList';
import SectionHeader from '../components/SectionHeader';
import QuickAddBar from '../components/QuickAddBar';
import BulkActionBar from '../components/BulkActionBar';
import AddTaskFab from '../components/AddTaskFab';
import ViewOptionsSheet from '../components/ViewOptionsSheet';
import ContextMenuTarget from '../components/ContextMenuTarget';
import TaskContextMenu from '../components/TaskContextMenu';
import Popover, { type PopoverAnchor } from '../components/Popover';
import SortOverrideBanner from '../components/SortOverrideBanner';
import Tooltip from '../components/Tooltip';
import { closeOpenSwipeRow } from '../components/SwipeableRow';
import { useLazyMount } from '../components/lazyMount';
import GlassIconButton, { GlassIconMenuLabel, GlassTextButton } from '../components/GlassIconButton';
import { MenuRow } from '../components/menu/MenuItems';
import DueDatePickerSheet from '../components/pickers/DueDatePickerSheet';
import ListPickerSheet from '../components/pickers/ListPickerSheet';
import TagPickerSheet from '../components/pickers/TagPickerSheet';
import { IconDotsHorizontal, IconMenu, IconViewOptions } from '../icons/Icons';

const TITLES = { all: 'All', inbox: 'Inbox', today: 'Today' } as const;
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

export default function TaskListScreen({ mode, filter }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const refreshControl = useSyncRefresh();
  const { wide, openDrawer } = useSidebar();
  const rowContext = useRowContext();
  const { openTask, openTaskId } = useDetail();
  const {
    state,
    updateTask,
    toggleComplete,
    snoozeTask,
    reorderTasks,
    setArrangement,
    clearArrangement,
    deleteTasks,
    bulkUpdate,
    addTaskFromQuickAdd,
    getViewOptions,
    setViewOptions,
  } = useTasks();
  const now = new Date();

  // Hosts every group's DragList; passed down so dragging auto-scrolls the page.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

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
      a = tasksDueByToday(state.tasks, now);
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
  }, [state.tasks, mode, filter, untriagedOnly, folderListIds]);

  const groups = useMemo(
    () => groupTasks(active, options, { lists: state.lists, folders: state.folders, now }),
    [active, options, state.lists, state.folders]
  );

  const {
    selectedIds: webSelection,
    anchorId,
    setAnchor,
    select,
    clear: clearSelection,
  } = useSelection();

  /**
   * Whether Shift was down for the press being handled.
   *
   * Taken from the pointer event that starts the press rather than from tracked
   * key state: React Native's press events carry no modifier of their own, and
   * reading the real one leaves no window for the two to disagree — a key
   * released while the window was unfocused, say. Capture phase, so it lands
   * before the press handler asks.
   */
  const shiftHeld = useRef(false);
  useEffect(() => {
    if (!WEB_ENTRY) return;
    const onDown = (e: PointerEvent) => {
      shiftHeld.current = e.shiftKey;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [clearSelection]);

  const isSelected = (id: string) =>
    WEB_ENTRY ? webSelection.includes(id) : selectedIds.includes(id);

  /**
   * Rows drawn with a tint: selected, or the one the surrounding UI is about.
   *
   * The anchor keeps its tint after the detail closes, because it is where the
   * next shift-click measures from and there would otherwise be nothing saying
   * so. Only that anchor state is gated on the pointer: a narrow desktop window
   * still has a shift key, and a phone has none, so on a touchscreen an anchor
   * tint would be pointing at a gesture that cannot be made.
   */
  const highlighted = (id: string) =>
    isSelected(id) ||
    contextTaskId === id ||
    openTaskId === id ||
    (FINE_POINTER && anchorId === id);

  /** Every visible task in display order — the sequence a shift range spans. */
  const flatIds = useMemo(() => groups.flatMap((g) => g.tasks.map((t) => t.id)), [groups]);

  /**
   * Shift extends from the last row clicked on its own; anything else opens the
   * task and makes it the new anchor. Matches how a file list behaves, and means
   * selecting never needs a mode to be entered first.
   */
  const pressRow = (id: string) => {
    closeOpenSwipeRow();
    if (!WEB_ENTRY) {
      if (selectionMode) toggleSelected(id);
      else openTask(id);
      return;
    }
    if (shiftHeld.current && anchorId) {
      const from = flatIds.indexOf(anchorId);
      const to = flatIds.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        select(flatIds.slice(lo, hi + 1));
        return;
      }
    }
    clearSelection();
    setAnchor(id);
    openTask(id);
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelected = (id: string) => {
    hapticSelect();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allSelected = selectedIds.length > 0 && selectedIds.length === active.length;
  const grouped = options.groupBy !== 'none';
  const headerActions: MenuAction[] = [
    {
      id: 'options',
      title: 'Group & sort',
      image: 'line.3.horizontal.decrease',
      imageColor: grouped || options.sortBy !== 'manual' ? accent : undefined,
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
  // — doesn't shift the rows underneath the finger that started it.
  const bottomChrome = nativeTabBarClearance(insets.bottom) + NATIVE_FAB_CLEARANCE;
  const quickAddLabel =
    filter?.type === 'folder' ? folderLists[0]?.name : filter ? filter.label : mode === 'today' ? 'Today' : undefined;

  // A filtered view implies its list/tag on every row; so does a group header when
  // grouping by the same dimension. The group wins, since it's the narrower scope.
  const filterHideListId = filter?.type === 'list' ? filter.value : undefined;
  const filterHideTag = filter?.type === 'tag' ? filter.value : undefined;

  const groupHide = (groupKey: string) => ({
    hideListId:
      options.groupBy === 'list' && groupKey !== INBOX_GROUP_KEY ? groupKey : filterHideListId,
    hideTag:
      options.groupBy === 'tag' && groupKey.startsWith('tag:') ? groupKey.slice(4) : filterHideTag,
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

  const arranged = hasArrangement(options.arrangements, options.sortBy);
  const restoreSort = () => clearArrangement(key, options.sortBy);

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
              handleGutter={canReorder && FINE_POINTER}
              showContext={rowContext}
              hideListId={hide.hideListId}
              hideTag={hide.hideTag}
              selected={isSelected(task.id)}
              onPress={() => pressRow(task.id)}
              onToggleComplete={() => toggleComplete(task.id)}
              onLater={() => snoozeTask(task.id)}
              onDone={() => toggleComplete(task.id)}
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
                  />
                );
              })()}
          </ContextMenuTarget>
        )}
      />
    </Card>
    );
  };

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
            <GlassIconButton onPress={openDrawer} label="Menu">
              <IconMenu />
            </GlassIconButton>
          )}
          <View style={styles.titleRow}>
            <Text style={styles.title}>{filter ? filter.label : TITLES[mode]}</Text>
            <Text style={styles.count}>{active.length}</Text>
          </View>
          {WEB_ENTRY ? (
            <Tooltip label="More">
              <GlassIconButton ref={headerMenuBtn} onPress={openHeaderMenu} label="More actions">
                <IconDotsHorizontal size={22} />
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
                <IconDotsHorizontal size={22} />
              </GlassIconMenuLabel>
            </MenuView>
          )}
        </View>
      )}

      {arranged && !selectionMode && (
        <View style={wide && styles.paneWide}>
          <SortOverrideBanner sortBy={options.sortBy} onRestore={restoreSort} />
        </View>
      )}

      {/* Outside the ScrollView so it stays put instead of scrolling away. */}
      {WEB_ENTRY && !selectionMode && canQuickAdd && (
        <View style={[styles.quickAddBand, wide && styles.paneWide]}>
          <QuickAddBar
            onSubmit={(text) => addTaskFromQuickAdd(text, quickAddDefaults)}
            contextLabel={quickAddLabel}
          />
        </View>
      )}

      <Animated.ScrollView
        ref={scrollRef}
        refreshControl={refreshControl}
        // Scrolling away from an open row is how you dismiss it everywhere else.
        onScrollBeginDrag={closeOpenSwipeRow}
        contentContainerStyle={[
          styles.scrollContent,
          !WEB_ENTRY && styles.scrollContentFab,
          !WEB_ENTRY && !wide && { paddingBottom: bottomChrome },
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
                  <View style={{ marginHorizontal: 6 }}>
                    <SectionHeader
                      label={group.label}
                      count={group.tasks.length}
                      color={group.color}
                      collapsed={collapsed}
                      onToggle={() => sections.toggleGroup(group.key)}
                    />
                  </View>
                  {!collapsed && (
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
                        onLater={() => snoozeTask(task.id)}
                        onDone={() => toggleComplete(task.id)}
                      />
                      {i < completed.length - 1 && <Divider />}
                    </View>
                  ))}
                </Card>
              </Animated.View>
            )}
          </Animated.View>
        )}
      </Animated.ScrollView>

      {!WEB_ENTRY && canQuickAdd && (
        <AddTaskFab defaults={quickAddDefaults} contextLabel={quickAddLabel} hidden={selectionMode} />
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

      {WEB_ENTRY && headerMenuMounted && (
        <Popover
          visible={headerMenuOpen}
          onClose={() => setHeaderMenuOpen(false)}
          anchor={optionsAnchor}
          width={220}
        >
          <MenuRow
            icon={<IconViewOptions size={16} color={grouped || options.sortBy !== 'manual' ? accent : undefined} />}
            label="Group & sort"
            onPress={() => {
              setHeaderMenuOpen(false);
              setOptionsOpen(true);
            }}
          />
          {/* Selecting on the web is shift-click, so it needs no menu action. */}
        </Popover>
      )}

      {optionsMounted && (
      <ViewOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        value={options}
        onChange={(next) => {
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
        }}
        onRestore={restoreSort}
        anchor={optionsAnchor}
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
}

const useStyles = makeStyles((c) => ({
  screen: {
    flex: 1,
    backgroundColor: c.screenBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
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
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: c.textPrimary,
  },
  count: {
    fontFamily: fonts.monoRegular,
    fontSize: 13.5,
    color: c.textTertiary,
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
  /** Clears the floating button so it never covers the last row. */
  scrollContentFab: {
    paddingBottom: 96,
  },
  quickAddBand: {
    paddingBottom: 2,
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

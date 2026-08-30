import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
// Reanimated deprecated its own `runOnJS` in favour of this one, which lives in
// the worklets package it now sits on. Already a direct dependency.
import { scheduleOnRN } from 'react-native-worklets';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { NativeBottomTabBarProps } from '@react-navigation/bottom-tabs/unstable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { makeStyles } from '../theme/styles';
import { useHoverBg } from '../theme/hover';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import {
  activeLists,
  activeTasks,
  inboxCount,
  listCounts,
  tagCounts,
  tasksDueByToday,
  trashedTasks,
} from '../data/selectors';
import { InboxParams, NativeTaskViewParams, taskViewParams } from '../navigation/types';
import { useSidebar } from '../navigation/SidebarContext';
import NavContextMenu, { NavMenuTarget } from './NavContextMenu';
import ContextMenuTarget from './ContextMenuTarget';
import type { PopoverAnchor } from './Popover';
import { FolderDef, ListDef } from '../data/types';
import { FINE_POINTER } from '../data/platform';
import DragList from './DragList';
import { NavRow, flattenTree, resolveDrop } from './sidebar/navTree';
import { loadCollapsedFolders, saveCollapsedFolders } from '../data/storage';
import SyncIndicator from './SyncIndicator';
import {
  IconCalendar,
  IconBell,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFolder,
  IconInboxTray,
  IconPlus,
  IconSettings,
  IconStack,
  IconTag,
  IconTrash,
} from '../icons/Icons';

/** One nesting step: how far a list inside a folder is inset, and how far the
 *  finger must travel sideways to nest or un-nest one while dragging. */
const INDENT = 22;

/**
 * How far the finger travels before a hold becomes a drag.
 *
 * Below the indent step, so nudging sideways to change nesting depth reads as a
 * drag well before it reads as a change of depth.
 */
const LIFT_THRESHOLD = 8;

/**
 * How long a dragged folder takes to gather its lists up, and to put them back.
 *
 * Matched to the row's own lift in DragList, so the fold reads as one movement
 * with the rise rather than a second thing happening to the list.
 */
const FOLD_MS = 180;

export const SIDEBAR_WIDTH = 300;
/** Icon-only rail when the pinned sidebar is collapsed. */
export const SIDEBAR_COLLAPSED_WIDTH = 64;

/** Fixed at module scope: the set never varies, and a fresh array per render
 *  would rebuild seven rows for nothing. */
const VIEWS = [
  { route: 'AllTab', label: 'All', Icon: IconStack },
  { route: 'InboxTab', label: 'Inbox', Icon: IconInboxTray },
  { route: 'TodayTab', label: 'Today', Icon: IconClock },
  { route: 'CalendarTab', label: 'Calendar', Icon: IconCalendar },
  { route: 'ActivityTab', label: 'Activity', Icon: IconBell },
  { route: 'BrowseTab', label: 'Browse', Icon: IconFolder },
  { route: 'TrashTab', label: 'Trash', Icon: IconTrash },
] as const;

/**
 * The rows that are views of the first native tab rather than tabs of their own.
 *
 * Inbox and Today are absent because they *are* tabs — see `MainTabs`. Inbox
 * still gets a mention in `go` below: a list, folder or tag travels on its
 * route, and those are views of the first tab even though the bare row is not.
 */
const NATIVE_LIST_DESTINATIONS = {
  AllTab: { screen: 'Tasks', params: { view: 'all' } },
  ActivityTab: { screen: 'Activity', params: undefined },
  TrashTab: { screen: 'Trash', params: undefined },
} as const;

export type SidebarNavigationProps =
  | Pick<BottomTabBarProps, 'state' | 'navigation'>
  | Pick<NativeBottomTabBarProps, 'state' | 'navigation'>;

/** What a press asked for, in the same terms the selection is decided in. */
type PendingRow = { kind: 'route' | 'list' | 'folder' | 'tag'; value: string };

type Props = SidebarNavigationProps & {
  /** Runs a navigation after the drawer has finished closing. */
  onNavigate?: (navigate: () => void) => void;
};

/**
 * Memoised because the two places that render it re-render for reasons it has
 * nothing to do with: the drawer toggling its own liveness, the layout above
 * re-rendering for a tab change it already reflects. Its props are the
 * navigation state and one stable callback, so a bail-out here is exact — the
 * tree is rebuilt when the navigation moves, and on no other frame.
 */
const Sidebar = React.memo(function Sidebar({ state, navigation, onNavigate }: Props) {
  const hoverBg = useHoverBg();
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  /**
   * A folder is being dragged, so every folder's lists are folded shut.
   *
   * All of them, not just the one that rose. A folder cannot be dropped inside
   * another — `resolveDrop` gives folders no parent, because the schema is two
   * levels deep and has no way to say otherwise — but a nav still showing its
   * nested lists offers slots between them, which look exactly like somewhere a
   * folder could land. Flattening to folder headers and root lists leaves only
   * the drops that mean something.
   *
   * Deliberately not `collapsedFolders`: that one decides which rows exist, and
   * a row leaving the tree mid-drag is what `resetKey` exists to survive — it
   * remounts the sortable, which would destroy the very gesture that asked for
   * the fold. This hides the children in place instead, so the item set the
   * library is dragging never changes. See `FoldAway`.
   *
   * Armed at the lift rather than on touch-down: `onPressIn` fires on any touch
   * at all, so folding there emptied folders on a tap or the first moment of a
   * scroll.
   */
  const [foldingFolders, setFoldingFolders] = useState(false);
  /** Counts folded drags, so each one ends on a fresh sortable. See `dragEnd`. */
  const [foldEpoch, setFoldEpoch] = useState(0);
  /** Folders folded shut. Restored from the device and saved on every toggle. */
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>(loadCollapsedFolders);
  /**
   * The row that was just pressed, shown as selected before the navigation it
   * asked for has landed.
   *
   * The nav's selection is read out of navigation state, and navigation state
   * does not move until the destination has rendered — which for a list is long
   * enough that the press sat unacknowledged for the whole of it, and the drawer
   * appeared to have ignored it. Answering from the press instead puts the
   * highlight on the very next frame; the derived answer takes over the moment
   * it agrees. See `settled` below.
   */
  const [pending, setPending] = useState<PendingRow | null>(null);
  const [menuTarget, setMenuTarget] = useState<NavMenuTarget | null>(null);
  const [menuAt, setMenuAt] = useState<PopoverAnchor | null>(null);
  /**
   * Where the touch that armed the current drag went down, in window
   * coordinates, plus whether the menu it opened has since been dismissed.
   *
   * Held in a ref rather than state: it is read inside gesture callbacks that
   * must not be rebuilt as the finger moves, and nothing renders from it.
   */
  const press = React.useRef<{
    x: number;
    y: number;
    depth: 0 | 1;
    /** The depth the sideways travel is currently asking for. */
    intent: 0 | 1;
  } | null>(null);
  const { wide, collapsed: collapsedPref, toggleCollapsed, openServer, openNavSheet } = useSidebar();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // The drawer is a transient overlay, so it always shows the full sidebar.
  const collapsed = wide && collapsedPref;
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const { state: data, syncStatus, reorderList, reorderFolder } = useTasks();
  const rows = useMemo(
    () => flattenTree(data.folders, data.lists, { collapsed: collapsedFolders }),
    [data.folders, data.lists, collapsedFolders]
  );

  const toggleFolder = useCallback((id: string) => {
    setCollapsedFolders((current) => {
      const next = current.includes(id) ? current.filter((f) => f !== id) : [...current, id];
      saveCollapsedFolders(next);
      return next;
    });
  }, []);

  const rowFor = useCallback(
    (key: string): NavMenuTarget | null => {
      const row = rows.find((r) => r.key === key);
      if (!row) return null;
      return row.kind === 'folder'
        ? { kind: 'folder', id: row.folder.id }
        : { kind: 'list', id: row.list.id };
    },
    [rows]
  );

  const closeMenu = useCallback(() => {
    setMenuTarget(null);
    setMenuAt(null);
  }, []);

  /**
   * The hold became a drag: the menu goes, and a dragged folder folds the tree
   * down to its top level.
   *
   * Only a folder does this. Dragging a list is the one case that needs the
   * folders open, since dropping it inside one is the whole affordance.
   *
   * The drop needs no memory of what was open. A folder already collapsed
   * contributes no rows to fold, and nothing here touches `collapsedFolders`,
   * so clearing the flag restores exactly the set that was expanded before.
   */
  const lift = useCallback(
    (key: string) => {
      closeMenu();
      if (rows.find((r) => r.key === key)?.kind === 'folder') setFoldingFolders(true);
    },
    [closeMenu, rows]
  );

  /**
   * The drag is over: unfold, and hand the sortable a clean context.
   *
   * Unfolding alone leaves the rows clipped, because the damage is not in the
   * rows. The sortable lays its items out absolutely, stacking each one at the
   * total height of those above it, and it took those heights from rows that
   * were folded flat at the time — so it goes on placing full-height rows in
   * the space a folded one needed. Nothing outside the library can correct a
   * measurement it holds internally, which is why reopening the sidebar was the
   * only thing that worked: it remounts.
   *
   * So do that deliberately, via the escape hatch already here for exactly this
   * — a sortable whose measurements have gone stale. It is safe now in a way it
   * never is mid-drag: the gesture a remount would have destroyed is finished.
   *
   * Only after a drag that actually folded. A list drag disturbs no heights and
   * keeps its drop animation, which the remount would otherwise cut short.
   */
  const dragEnd = useCallback(() => {
    if (!foldingFolders) return;
    setFoldingFolders(false);
    setFoldEpoch((n) => n + 1);
  }, [foldingFolders]);

  /**
   * A row has been touched, well before any hold is recognised.
   *
   * Armed from the row's own `onPressIn` rather than a touch handler on the
   * wrapper: gesture-handler claims the touch natively, so a plain View around
   * the row never sees `onTouchStart` at all. The row's Pressable does, which is
   * also what makes a plain tap still work.
   *
   * The point it carries is the only reliable position available for the
   * gesture. The library's drag-start reports no coordinates, and by the time it
   * fires the row is mid-lift — scaled and translating — so measuring it then
   * gives a moving target. It is also the baseline the travel tests measure
   * from, so one capture serves the menu's anchor, the 8px cancel and the
   * sideways depth intent alike.
   */
  const arm = useCallback(
    (key: string, point: { x: number; y: number }) => {
      const depth = rows.find((r) => r.key === key)?.depth ?? 0;
      press.current = { ...point, depth, intent: depth };
    },
    [rows]
  );

  /**
   * The hold has been recognised: the row is lifting, so the menu comes up with
   * it, anchored where the finger went down.
   *
   * The press point rather than the row's own rect, for two reasons. The library
   * reports no position here, and measuring the row now would measure it
   * mid-lift — scaled and translating. It is also the baseline the travel test
   * below has to work from, so one value serves both.
   *
   * With a mouse there is no hold at all: a drag starts from the grip, and the
   * menu comes from right-click instead. Popping a panel because someone grabbed
   * the handle would be actively wrong.
   */
  const dragStart = useCallback(
    (key: string) => {
      if (FINE_POINTER) return;
      const at = press.current;
      if (!at) return;
      setMenuTarget(rowFor(key));
      setMenuAt({ x: at.x, y: at.y, width: 0, height: 0 });
    },
    [rowFor]
  );

  /**
   * Tracks how deep the finger is asking the row to sit.
   *
   * Turning the hold into a drag is `liftAfter`'s job, on the same travel; this
   * only reads the sideways component of it.
   *
   * None of these distances fight `dragActivationFailOffset`, though the numbers
   * look like they should: that one only applies while the hold is still being
   * recognised — it is how a scroll flick escapes — and by the time anything
   * here runs the drag is claimed and the ScrollView has lost the gesture.
   */
  const dragMove = useCallback(
    (_key: string, point: { x: number; y: number }) => {
      const at = press.current;
      if (!at) return;
      // Sideways travel is how a list is nested or pulled back out. Vertical
      // position alone cannot say: the slot under a folder's last child is both
      // "another child" and "a root list following the folder". One indent step
      // of travel switches between them, which is how the outliners do it and
      // the only way a nested list can be dragged back to the root at all.
      at.intent = Math.min(1, Math.max(0, at.depth + Math.round((point.x - at.x) / INDENT))) as 0 | 1;
    },
    []
  );

  const reorder = useCallback(
    (keys: string[], moved: { id: string }) => {
      const byKey = new Map(rows.map((r) => [r.key, r]));
      const next = keys.map((k) => byKey.get(k)).filter((r): r is NavRow => !!r);
      const row = byKey.get(moved.id);
      const drop = resolveDrop(next, moved.id, press.current?.intent ?? 0);
      if (!row || !drop) return;
      if (row.kind === 'list') reorderList(row.list.id, drop.parentId, drop.prevId, drop.nextId);
      else reorderFolder(row.folder.id, drop.prevId, drop.nextId);
    },
    [rows, reorderList, reorderFolder]
  );

  /**
   * Every number the nav shows, derived once per change to the tasks.
   *
   * These used to be computed inline, which meant a full pass over the task
   * collection — five of them, plus a sort each — on every render of the
   * sidebar. The sidebar renders on things that have nothing to do with the
   * counts: a navigation, the drawer settling, a sync tick. Deriving them off
   * `data.tasks` alone means those renders cost nothing.
   */
  const counts = useMemo(() => listCounts(data.tasks), [data.tasks]);
  const tags = useMemo(() => tagCounts(data.tasks), [data.tasks]);
  const viewCounts = useMemo<Record<string, number | null>>(() => {
    const now = new Date();
    return {
      // Via the selector, so trashed rows are excluded the same way every view
      // excludes them.
      AllTab: activeTasks(data.tasks).length,
      InboxTab: inboxCount(data.tasks),
      TodayTab: tasksDueByToday(data.tasks, now).length,
      TrashTab: trashedTasks(data.tasks).length || null,
    };
  }, [data.tasks]);
  /**
   * A folder's total, for every folder at once.
   *
   * `folderTotal` re-sorts every active list to find one folder's, so calling it
   * per row made the tree quadratic in the number of lists.
   */
  const folderTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const list of activeLists(data.lists)) {
      if (!list.folderId) continue;
      out[list.folderId] = (out[list.folderId] ?? 0) + (counts[list.id] ?? 0);
    }
    return out;
  }, [data.lists, counts]);

  const current = state.routes[state.index];
  const inboxRoute = state.routes.find((r) => r.name === 'InboxTab');
  const listRoute = state.routes.find((r) => r.name === 'ListsTab');
  const native = Platform.OS !== 'web';
  const listState = (listRoute as {
    state?: { index: number; routes: Array<{ name: string; params?: NativeTaskViewParams }> };
  } | undefined)?.state;
  const pendingList = native
    ? listRoute?.params as { screen?: string; params?: NativeTaskViewParams } | undefined
    : undefined;
  const nestedListRoute = listState?.routes[listState.index];
  const nativeListScreen = native
    ? nestedListRoute?.name ?? pendingList?.screen ?? 'Tasks'
    : undefined;
  const nativeListParams = nativeListScreen === 'Tasks'
    ? nestedListRoute?.params ?? pendingList?.params
    : undefined;
  const inboxParams = native
    ? nativeListParams
    : inboxRoute?.params as InboxParams | undefined;
  const filtered = !!(inboxParams?.listId || inboxParams?.folderId || inboxParams?.tag);
  const onInbox = current.name === 'InboxTab';
  const onListTab = native && current.name === 'ListsTab';

  const go = useCallback(
    (route: string, params?: object) => {
      // Recorded here rather than at the eight call sites: this is the funnel
      // every destination already passes through, and the params it is handed
      // are the same ones the selection is later read back out of.
      const asked = params as InboxParams | undefined;
      setPending(
        asked?.listId
          ? { kind: 'list', value: asked.listId }
          : asked?.folderId
            ? { kind: 'folder', value: asked.folderId }
            : asked?.tag
              ? { kind: 'tag', value: asked.tag }
              : { kind: 'route', value: route }
      );

      const navigate = () => {
        // A list, folder or tag travels on the Inbox row's route, carrying the
        // view it wants in its params. Those go to the first tab, which is where
        // filtered views live; the bare Inbox row goes to the Inbox tab.
        const destination = native
          ? route === 'InboxTab' && params
            ? { screen: 'Tasks' as const, params }
            : NATIVE_LIST_DESTINATIONS[route as keyof typeof NATIVE_LIST_DESTINATIONS]
          : undefined;
        if (destination) {
          const { screen, params: next } = destination;
          (navigation.navigate as (name: string, params?: object) => void)('ListsTab', {
            screen,
            // Every destination on this screen is a whole view, never a change to
            // part of one — see `taskViewParams`.
            params: screen === 'Tasks' ? taskViewParams(next as NativeTaskViewParams) : next,
          });
        } else {
          (navigation.navigate as (name: string, params?: object) => void)(route, params);
        }
      };

      if (onNavigate) onNavigate(navigate);
      else navigate();
    },
    [native, navigation, onNavigate]
  );

  // Params replace rather than merge, so setting one filter clears the others.
  const openFilter = useCallback((filter: InboxParams) => go('InboxTab', filter), [go]);
  /**
   * Taken by id rather than as a closure per row.
   *
   * The tree rebuilds its row elements on every render — the sortable calls
   * `renderItem` again — so a fresh `() => openFilter({ listId })` would give
   * every row a new prop and defeat the memo on `ListRow` below. One stable
   * handler per row kind keeps the props identical, and a navigation then
   * re-renders only the two rows whose selected state actually moved.
   */
  const openList = useCallback((id: string) => openFilter({ listId: id }), [openFilter]);
  const openFolder = useCallback((id: string) => openFilter({ folderId: id }), [openFilter]);
  const openTag = useCallback((tag: string) => openFilter({ tag }), [openFilter]);
  const filterActive = (type: 'list' | 'folder' | 'tag', value: string) => {
    if (native ? !onListTab || nativeListScreen !== 'Tasks' : !onInbox) return false;
    if (type === 'list') return inboxParams?.listId === value;
    if (type === 'folder') return inboxParams?.folderId === value;
    return inboxParams?.tag === value;
  };

  /** The same question for the fixed views, which reach their screens by route. */
  const routeActive = (route: string): boolean => {
    const destination = native
      ? NATIVE_LIST_DESTINATIONS[route as keyof typeof NATIVE_LIST_DESTINATIONS]
      : undefined;
    if (destination) {
      if (!onListTab || nativeListScreen !== destination.screen) return false;
      if (destination.screen !== 'Tasks') return true;
      // A list, folder or tag has a row of its own further down the tree, and
      // while one is open none of the fixed views is what the tab is showing.
      return !filtered && (nativeListParams?.view ?? 'all') === destination.params.view;
    }
    // On native a filter is a view of the *first* tab, so the Inbox tab being up
    // is the whole question; `filtered` there describes a different tab.
    if (route === 'InboxTab') return native ? onInbox : onInbox && !filtered;
    return current.name === route;
  };

  /** What the nav draws as selected: the press, while one is still in flight. */
  const showActive = (kind: PendingRow['kind'], value: string): boolean =>
    pending
      ? pending.kind === kind && pending.value === value
      : kind === 'route'
        ? routeActive(value)
        : filterActive(kind, value);

  /**
   * The navigation has caught up, so the press has nothing left to say.
   *
   * Cleared on agreement rather than on the first change to navigation state: a
   * nested destination arrives in two commits, and letting go on the first of
   * them would drop the highlight back on the old row for a frame before it
   * moved to the new one — the flicker this exists to remove, moved later.
   */
  const settled =
    pending !== null
    && (pending.kind === 'route'
      ? routeActive(pending.value)
      : filterActive(pending.kind, pending.value));
  useEffect(() => {
    if (settled) setPending(null);
  }, [settled]);

  return (
    <View
      style={[
        styles.sidebar,
        collapsed && { width: SIDEBAR_COLLAPSED_WIDTH },
        { paddingTop: insets.top + 14 },
      ]}
    >
      <View style={[styles.brandRow, collapsed && styles.brandRowCollapsed]}>
        {!collapsed && <Text style={styles.brand}>Yarukoto</Text>}
        {wide && (
          <Pressable
            onPress={toggleCollapsed}
            hitSlop={8}
            accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
          </Pressable>
        )}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {VIEWS.map(({ route, label, Icon }) => {
          const active = showActive('route', route);
          const count = viewCounts[route] ?? null;
          return (
            <Pressable
              key={route}
              style={hoverBg([styles.row, collapsed && styles.rowCollapsed, active && { backgroundColor: colors.selectedRowBg }], active)}
              onPress={() => go(route)}
              accessibilityLabel={label}
            >
              <Icon size={20} color={active ? accent : colors.textTertiary} />
              {!collapsed && (
                <>
                  <Text style={[styles.rowLabel, active && { color: accent, fontFamily: fonts.sansSemiBold }]}>
                    {label}
                  </Text>
                  {count !== null && <Text style={styles.rowCount}>{count}</Text>}
                </>
              )}
            </Pressable>
          );
        })}

        {/* Sets the tree apart from the fixed views above it, which are a
            different kind of thing: those are always there, these are yours. */}
        <View style={styles.treeSeparator} />

        {/*
          Folders and their lists are one flat sortable, not a sortable per
          folder: the library reorders siblings and cannot hand an item to
          another container, so nesting would leave a list dragged towards a
          different folder with no slot opening for it. `navTree` flattens the
          tree on the way in and reads the meaning back out of the drop.

          Collapsed rail mode opts out — there is nothing to drag when the rows
          are 20pt colour badges with no folder headings between them.
        */}
        <DragList
          items={rows}
          keyExtractor={(row) => row.key}
          enabled={!collapsed}
          scrollableRef={scrollRef}
          onDragStart={dragStart}
          onDragMove={dragMove}
          // One threshold governs both halves of the gesture: crossing it is
          // what turns a hold into a drag, so the row rises and the menu that
          // was asking "which did you mean?" gets out of the way together.
          liftAfter={LIFT_THRESHOLD}
          onLift={lift}
          onDragEnd={dragEnd}
          onReorder={reorder}
          // Two things invalidate the sortable's measurements: rows appearing
          // and disappearing outright, and a fold having flattened them while
          // it was reading their heights. Note what is absent — the fold going
          // *on*. Remounting there would destroy the gesture that asked for it,
          // so the epoch only turns once the drag is over.
          resetKey={`${collapsedFolders.join('|')}#${foldEpoch}`}
          renderItem={(row) => (
            // Wrapped whether or not it can fold: making the wrapper
            // conditional would change the element tree the moment a fold
            // starts, remounting the row under the finger that asked for it.
            <FoldAway folded={foldingFolders && row.depth === 1}>
              {/* Right-click is the mouse's way in: there is no hold to long-press
                  with, and the grip is reserved for dragging. Web-only by
                  construction — on native this is a plain View. */}
              <ContextMenuTarget
                onOpen={(pos) => {
                  setMenuTarget(rowFor(row.key));
                  setMenuAt({ x: pos.x, y: pos.y, width: 0, height: 0 });
                }}
              >
                {row.kind === 'folder' ? (
                  <FolderRow
                    rowKey={row.key}
                    onPressIn={arm}
                    held={menuTarget?.id === row.folder.id}
                    folder={row.folder}
                    rail={collapsed}
                    count={folderTotals[row.folder.id] ?? 0}
                    folded={collapsedFolders.includes(row.folder.id)}
                    active={showActive('folder', row.folder.id)}
                    accent={accent}
                    onPress={openFolder}
                    onToggle={toggleFolder}
                  />
                ) : (
                  <ListRow
                    rowKey={row.key}
                    onPressIn={arm}
                    held={menuTarget?.id === row.list.id}
                    list={row.list}
                    rail={collapsed}
                    depth={row.depth}
                    count={counts[row.list.id] ?? 0}
                    active={showActive('list', row.list.id)}
                    accent={accent}
                    onPress={openList}
                  />
                )}
              </ContextMenuTarget>
            </FoldAway>
          )}
        />

        {!collapsed && (
          <View style={styles.addRow}>
            <Pressable
              style={hoverBg(styles.newRow)}
              onPress={() => openNavSheet({ kind: 'newList', folderId: null })}
              accessibilityLabel="New list"
            >
              <IconPlus size={17} color={colors.textTertiary} />
              <Text style={styles.newLabel}>New list</Text>
            </Pressable>
            <Pressable
              style={hoverBg(styles.newRow)}
              onPress={() => openNavSheet({ kind: 'newFolder' })}
              accessibilityLabel="New folder"
            >
              <IconPlus size={17} color={colors.textTertiary} />
              <Text style={styles.newLabel}>New folder</Text>
            </Pressable>
          </View>
        )}

        {tags.length > 0 && !collapsed && (
          <View>
            <Text style={styles.sectionLabel}>Tags</Text>
            {tags.map(({ tag, count }) => {
              const active = showActive('tag', tag);
              return (
                <Pressable
                  key={tag}
                  style={hoverBg([styles.row, active && { backgroundColor: colors.selectedRowBg }], active)}
                  onPress={() => openTag(tag)}
                >
                  <IconTag size={18} color={active ? accent : colors.textTertiary} />
                  <Text
                    style={[styles.rowLabel, styles.tagLabel, active && { color: accent }]}
                    numberOfLines={1}
                  >
                    #{tag}
                  </Text>
                  <Text style={styles.rowCount}>{count}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Animated.ScrollView>

      <Pressable
        style={hoverBg([styles.footer, collapsed && styles.footerCollapsed, { paddingBottom: Math.max(12, insets.bottom) }])}
        onPress={openServer}
        accessibilityLabel="Server settings"
      >
        <SyncIndicator
          mode={data.mode}
          status={syncStatus}
          serverUrl={data.serverUrl}
          compact={collapsed}
        />
        <IconSettings size={18} color={colors.textTertiary} />
      </Pressable>

      <NavContextMenu
        // The nav is inside the drawer's Modal in the narrow layout, and a
        // second Modal presented from within one never appears on iOS. Drawn
        // into the sidebar instead, which fills the height it needs.
        inline
        bounds={{ width: SIDEBAR_WIDTH, height: winHeight }}
        target={menuTarget}
        at={menuAt}
        onClose={closeMenu}
        onRename={() =>
          menuTarget &&
          openNavSheet(
            menuTarget.kind === 'list'
              ? { kind: 'renameList', id: menuTarget.id }
              : { kind: 'renameFolder', id: menuTarget.id }
          )
        }
        onNewList={
          menuTarget?.kind === 'folder'
            ? () => openNavSheet({ kind: 'newList', folderId: menuTarget.id })
            : undefined
        }
      />
    </View>
  );
});

export default Sidebar;

/**
 * Folds a row shut in place, without taking it out of the tree.
 *
 * For the lists under a folder being dragged. Dropping them from the item set
 * would be the obvious way and is the one thing that must not happen: the
 * sortable rebuilds `indexToKey` from the child keys with no regard for a drag
 * in flight, so removing rows mid-gesture swaps the order array out from under
 * the index the drag started at. Height is safe where the key set is not — the
 * library re-measures items whose dimensions change and says so, calling out
 * "collapsible items which change their height when the user starts dragging
 * them" as a case it handles.
 *
 * The height has to be measured because there is nothing to animate to
 * otherwise, and it is read from an inner view that keeps its natural size, so
 * the number stays available all the way through the fold.
 *
 * The override is detached once a fold has finished opening, rather than left
 * applied at its natural height. An animated style goes on applying whatever it
 * last wrote, so a style that merely stops mentioning height — by returning
 * `undefined`, or by dropping the key — leaves the row pinned to the measurement
 * the fold ended on, and a row that later grew never shows the difference. Only
 * taking the whole style out of the array gives the height back.
 */
function FoldAway({ folded, children }: { folded: boolean; children: React.ReactNode }) {
  const styles = useStyles();
  const height = useSharedValue<number | null>(null);
  const progress = useSharedValue(0);
  /** Whether the height override is attached at all. See above. */
  const [overriding, setOverriding] = useState(false);

  useEffect(() => {
    // Attached before the fold starts and detached only once one has finished
    // opening, so it spans the animation in both directions. An interrupted
    // animation reports `finished: false` and leaves it attached, which is
    // right: something else is already driving it.
    if (folded) setOverriding(true);
    progress.value = withTiming(folded ? 1 : 0, { duration: FOLD_MS }, (finished) => {
      'worklet';
      if (finished && !folded) scheduleOnRN(setOverriding, false);
    });
  }, [folded, progress]);

  const style = useAnimatedStyle(() => ({
    height: (height.value ?? 0) * (1 - progress.value),
    opacity: 1 - progress.value,
  }));

  return (
    <Animated.View style={[styles.fold, overriding && style]}>
      <View onLayout={(e) => (height.value = e.nativeEvent.layout.height)}>{children}</View>
    </Animated.View>
  );
}

/**
 * A folder, as a row rather than a caption.
 *
 * Folders used to be uppercase section labels — typography, not objects. That
 * read badly once they became things you grab and reorder: you cannot drag a
 * heading. As a row with the same height, icon column and trailing count as a
 * list, a folder looks like the peer it now is, and its chevron has somewhere
 * obvious to live.
 */
const FolderRow = React.memo(function FolderRow({
  rowKey,
  folder,
  rail,
  count,
  folded,
  active,
  accent,
  onPress,
  onToggle,
  onPressIn,
  held,
}: {
  /** This row's key in the flattened tree, handed back to the id-taking handlers. */
  rowKey: string;
  folder: FolderDef;
  onPressIn: (key: string, point: { x: number; y: number }) => void;
  /** Its menu is open. See `heldRowBg`. */
  held: boolean;
  /** The collapsed icon-only sidebar, not a folded folder. */
  rail: boolean;
  count: number;
  folded: boolean;
  active: boolean;
  accent: string;
  onPress: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const hoverBg = useHoverBg();
  const colors = useColors();
  const styles = useStyles();
  if (rail) return null;
  return (
    <Pressable
      style={hoverBg(
        [
          styles.row,
          active && { backgroundColor: colors.selectedRowBg },
          held && { backgroundColor: colors.heldRowBg },
        ],
        active || held
      )}
      onPress={() => onPress(folder.id)}
      onPressIn={(e) => onPressIn(rowKey, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      accessibilityLabel={folder.name}
      accessibilityState={{ selected: active }}
    >
      <View style={styles.rowIcon}>
        <IconFolder size={19} color={active ? accent : colors.textTertiary} />
      </View>
      <Text
        style={[styles.rowLabel, active && { color: accent, fontFamily: fonts.sansSemiBold }]}
        numberOfLines={1}
      >
        {folder.name}
      </Text>
      {/*
        Count and chevron are one disclosure target. They stop the event here so
        the enclosing row selects the folder only when its main surface is tapped.
      */}
      <Pressable
        style={styles.folderDisclosure}
        hitSlop={5}
        onPress={(event) => {
          event.stopPropagation();
          onToggle(folder.id);
        }}
        accessibilityLabel={`${folded ? 'Expand' : 'Collapse'} ${folder.name}`}
      >
        {count > 0 && <Text style={[styles.rowCount, active && { color: accent }]}>{count}</Text>}
        <View style={styles.chevron}>
          {folded ? (
            <IconChevronRight size={14} color={active ? accent : colors.textTertiary} />
          ) : (
            <IconChevronDown size={14} color={active ? accent : colors.textTertiary} />
          )}
        </View>
      </Pressable>
    </Pressable>
  );
});

const ListRow = React.memo(function ListRow({
  rowKey,
  list,
  rail,
  depth,
  count,
  active,
  accent,
  onPress,
  onPressIn,
  held,
}: {
  /** This row's key in the flattened tree, handed back to the id-taking handlers. */
  rowKey: string;
  list: ListDef;
  onPressIn: (key: string, point: { x: number; y: number }) => void;
  /** Its menu is open. See `heldRowBg`. */
  held: boolean;
  rail: boolean;
  /** 1 when the list sits inside a folder, and is inset under it. */
  depth: 0 | 1;
  count: number;
  active: boolean;
  accent: string;
  onPress: (id: string) => void;
}) {
  const hoverBg = useHoverBg();
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      style={hoverBg(
        [
          styles.row,
          rail && styles.rowCollapsed,
          // The inset lands on the row, not the label, so the whole row still
          // takes a press and the hover fill starts where the row appears to.
          !rail && depth === 1 && { marginLeft: INDENT },
          active && { backgroundColor: colors.selectedRowBg },
          // Last, so a held row reads as held even when it is also the view
          // you are currently looking at.
          held && { backgroundColor: colors.heldRowBg },
        ],
        active || held
      )}
      onPress={() => onPress(list.id)}
      onPressIn={(e) => onPressIn(rowKey, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      accessibilityLabel={list.name}
    >
      {rail ? (
        <View style={[styles.letterBadge, { backgroundColor: list.color }]}>
          <Text style={styles.letterBadgeText}>{list.name.charAt(0).toUpperCase()}</Text>
        </View>
      ) : (
        <>
          <View style={styles.rowIcon}>
            <View style={[styles.dot, { backgroundColor: list.color }]} />
          </View>
        </>
      )}
      {!rail && (
        <>
          <Text
            style={[styles.rowLabel, active && { color: accent, fontFamily: fonts.sansSemiBold }]}
            numberOfLines={1}
          >
            {list.name}
          </Text>
          {count > 0 && <Text style={styles.rowCount}>{count}</Text>}
        </>
      )}
    </Pressable>
  );
});

const useStyles = makeStyles((c) => ({
  sidebar: {
    // Fixed width in the wide row layout, full height in the drawer panel.
    width: SIDEBAR_WIDTH,
    height: '100%',
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: c.canvasBg,
    borderRightWidth: 1,
    borderRightColor: c.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    paddingBottom: 14,
  },
  brandRowCollapsed: {
    justifyContent: 'center',
    paddingRight: 0,
  },
  rowCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  footerCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  brand: {
    fontFamily: fonts.sansBold,
    fontSize: 19,
    flex: 1,
    color: c.textPrimary,
    paddingHorizontal: 18,
  },
  scrollArea: {
    flex: 1,
  },
  /**
   * Clips the row while it folds. Without it the content keeps its natural
   * height and simply overflows the shrinking box, so nothing appears to close.
   */
  fold: {
    overflow: 'hidden',
  },
  scroll: {
    paddingHorizontal: 10,
    paddingBottom: 14,
    // The scroller is already flex:1; this is the content filling it, so the
    // space under the last tag belongs to the list and can be dragged on.
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    minHeight: 44,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 16.5,
    color: c.textPrimary,
  },
  tagLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 15,
  },
  rowCount: {
    fontFamily: fonts.monoRegular,
    fontSize: 14,
    color: c.textFaint,
  },
  /** The Tags caption. Folders used to share this and are now rows instead. */
  sectionLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textFaint,
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 8,
  },
  treeSeparator: {
    height: 1,
    backgroundColor: c.border,
    // Inset to the row text rather than the full width, so it reads as a rule
    // between two groups of rows and not as an edge of the sidebar.
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  /** Both adds share a line, now that a list can be made at the root too. */
  addRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  /** Mirrors the sidebar row metrics so it sits on the same rhythm as the lists. */
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    minHeight: 44,
  },
  /** Matches TaskDetailView's "Add subtask" — the app's other subordinate add row. */
  newLabel: {
    fontFamily: fonts.sansRegular,
    fontSize: 16.5,
    color: c.textTertiary,
  },
  /** Reserves the chevron's column so every row's icon and label line up. */
  /** The disclosure column, at the trailing edge of a folder row. */
  chevron: {
    width: 14,
    alignItems: 'center',
  },
  folderDisclosure: {
    alignSelf: 'stretch',
    minWidth: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  /**
   * One column for whatever marks a row — a folder's icon, a list's dot.
   *
   * Sized to the bare icons the fixed views above draw, so a label starts at the
   * same x in both halves of the nav.
   */
  rowIcon: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  letterBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBadgeText: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: c.surface,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
}));

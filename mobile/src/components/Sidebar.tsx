import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { hoverBg } from '../theme/hover';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import {
  activeTasks,
  folderTotal,
  inboxCount,
  listCounts,
  listsInFolder,
  tagCounts,
  tasksForToday,
  trashedTasks,
} from '../data/selectors';
import { InboxParams } from '../navigation/types';
import { useSidebar } from '../navigation/SidebarContext';
import NavContextMenu, { NavMenuTarget } from './NavContextMenu';
import ContextMenuTarget from './ContextMenuTarget';
import type { PopoverAnchor } from './Popover';
import { FolderDef, ListDef } from '../data/types';
import { FINE_POINTER } from '../data/platform';
import DragList from './DragList';
import { NavRow, flattenTree, resolveDrop } from './sidebar/navTree';
import { loadCollapsedFolders, saveCollapsedFolders } from '../data/storage';
import ListOptionsSheet from './pickers/ListOptionsSheet';
import FolderOptionsSheet from './pickers/FolderOptionsSheet';
import NewListSheet from './pickers/NewListSheet';
import NewFolderSheet from './pickers/NewFolderSheet';
import SyncIndicator from './SyncIndicator';
import {
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFolder,
  IconInboxTray,
  IconPlus,
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

export const SIDEBAR_WIDTH = 260;
/** Icon-only rail when the pinned sidebar is collapsed. */
export const SIDEBAR_COLLAPSED_WIDTH = 56;

function viewsFor() {
  return [
    { route: 'AllTab', label: 'All', Icon: IconStack },
    { route: 'InboxTab', label: 'Inbox', Icon: IconInboxTray },
    { route: 'TodayTab', label: 'Today', Icon: IconClock },
    { route: 'CalendarTab', label: 'Calendar', Icon: IconCalendar },
    { route: 'BrowseTab', label: 'Browse', Icon: IconFolder },
    { route: 'TrashTab', label: 'Trash', Icon: IconTrash },
  ];
}

interface Props extends BottomTabBarProps {
  /** Called after any navigation — the drawer uses it to close itself. */
  onNavigate?: () => void;
}

export default function Sidebar({ state, navigation, onNavigate }: Props) {
  const accent = useAccent();
  const [listTarget, setListTarget] = useState<ListDef | null>(null);
  const [folderTarget, setFolderTarget] = useState<FolderDef | null>(null);
  /** Outer null = closed; `folder` null = a list at the root. */
  const [newList, setNewList] = useState<{ folder: FolderDef | null } | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  /**
   * The folder whose lists are hidden because its header is being dragged.
   *
   * Armed on touch-down, ~200ms before the library recognises the hold, so the
   * item set is never mutated mid-drag. See `flattenTree`.
   */
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  /** Folders folded shut. Restored from the device and saved on every toggle. */
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>(loadCollapsedFolders);
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
  const { wide, collapsed: collapsedPref, toggleCollapsed, openServer, closeDrawer } = useSidebar();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // The drawer is a transient overlay, so it always shows the full sidebar.
  const collapsed = wide && collapsedPref;
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const { state: data, syncStatus, reorderList, reorderFolder } = useTasks();
  const now = new Date();
  const rows = useMemo(
    () => flattenTree(data.folders, data.lists, { collapsed: collapsedFolders, dragging: draggingFolderId }),
    [data.folders, data.lists, collapsedFolders, draggingFolderId]
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
      // A folder travels as a unit, so its children fold away for the duration.
      setDraggingFolderId(key.startsWith('f:') ? key.slice(2) : null);
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

  const counts = listCounts(data.tasks);
  const tags = tagCounts(data.tasks);
  // Via the selector, so trashed rows are excluded the same way every view excludes them.
  const activeCount = activeTasks(data.tasks).length;

  const current = state.routes[state.index];
  const inboxRoute = state.routes.find((r) => r.name === 'InboxTab');
  const inboxParams = inboxRoute?.params as InboxParams | undefined;
  const filtered = !!(inboxParams?.listId || inboxParams?.tag);
  const onInbox = current.name === 'InboxTab';

  const go = (route: string, params?: object) => {
    (navigation.navigate as (name: string, params?: object) => void)(route, params);
    onNavigate?.();
  };

  const viewCount = (route: string): number | null => {
    if (route === 'AllTab') return activeCount;
    if (route === 'InboxTab') return inboxCount(data.tasks);
    if (route === 'TodayTab') return tasksForToday(data.tasks, now).length;
    if (route === 'TrashTab') return trashedTasks(data.tasks).length || null;
    return null;
  };

  // Params replace rather than merge, so setting one of the two clears the other.
  const openFilter = (filter: InboxParams) => go('InboxTab', filter);
  const filterActive = (type: 'list' | 'tag', value: string) =>
    onInbox && (type === 'list' ? inboxParams?.listId : inboxParams?.tag) === value;

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
            {collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
          </Pressable>
        )}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {viewsFor().map(({ route, label, Icon }) => {
          const active = current.name === route && (route !== 'InboxTab' || !filtered);
          const count = viewCount(route);
          return (
            <Pressable
              key={route}
              style={hoverBg([styles.row, collapsed && styles.rowCollapsed, active && { backgroundColor: colors.selectedRowBg }], active)}
              onPress={() => go(route)}
              accessibilityLabel={label}
            >
              <Icon size={18} color={active ? accent : colors.textTertiary} />
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
          onLift={closeMenu}
          onDropped={() => setDraggingFolderId(null)}
          onReorder={reorder}
          // From the data, not from `rows`: by the time a folder is being
          // dragged its children have already been folded out of the tree, so
          // counting rows would always say one.
          dragCount={(key) =>
            key.startsWith('f:') ? listsInFolder(data.lists, key.slice(2)).length + 1 : 1
          }
          renderItem={(row) => (
            // Right-click is the mouse's way in: there is no hold to long-press
            // with, and the grip is reserved for dragging. Web-only by
            // construction — on native this is a plain View.
            <ContextMenuTarget
              onOpen={(pos) => {
                setMenuTarget(rowFor(row.key));
                setMenuAt({ x: pos.x, y: pos.y, width: 0, height: 0 });
              }}
            >
              {row.kind === 'folder' ? (
                <FolderRow
                  onPressIn={(point) => arm(row.key, point)}
                  held={menuTarget?.id === row.folder.id}
                  folder={row.folder}
                  rail={collapsed}
                  count={folderTotal(data.lists, counts, row.folder.id)}
                  folded={collapsedFolders.includes(row.folder.id)}
                  onToggle={() => toggleFolder(row.folder.id)}
                />
              ) : (
                <ListRow
                  onPressIn={(point) => arm(row.key, point)}
                  held={menuTarget?.id === row.list.id}
                  list={row.list}
                  rail={collapsed}
                  depth={row.depth}
                  count={counts[row.list.id] ?? 0}
                  active={filterActive('list', row.list.id)}
                  accent={accent}
                  onPress={() => openFilter({ listId: row.list.id })}
                />
              )}
            </ContextMenuTarget>
          )}
        />

        {!collapsed && (
          <View style={styles.addRow}>
            <Pressable style={hoverBg(styles.newRow)} onPress={() => setNewList({ folder: null })} accessibilityLabel="New list">
              <IconPlus size={15} color={colors.textTertiary} />
              <Text style={styles.newLabel}>New list</Text>
            </Pressable>
            <Pressable style={hoverBg(styles.newRow)} onPress={() => setNewFolderOpen(true)} accessibilityLabel="New folder">
              <IconPlus size={15} color={colors.textTertiary} />
              <Text style={styles.newLabel}>New folder</Text>
            </Pressable>
          </View>
        )}

        {tags.length > 0 && !collapsed && (
          <View>
            <Text style={styles.sectionLabel}>Tags</Text>
            {tags.map(({ tag, count }) => {
              const active = filterActive('tag', tag);
              return (
                <Pressable
                  key={tag}
                  style={hoverBg([styles.row, active && { backgroundColor: colors.selectedRowBg }], active)}
                  onPress={() => openFilter({ tag })}
                >
                  <IconTag size={16} color={active ? accent : colors.textTertiary} />
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
        accessibilityLabel="Server connection"
      >
        <SyncIndicator
          mode={data.mode}
          status={syncStatus}
          serverUrl={data.serverUrl}
          compact={collapsed}
        />
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
        onRename={() => {
          if (!menuTarget) return;
          // The sheets portal to a provider outside the drawer's Modal, so from
          // the drawer they would open behind it. Closing the nav first is also
          // simply what you want: you have left the list to go edit it.
          closeDrawer();
          if (menuTarget.kind === 'list') {
            setListTarget(data.lists.find((l) => l.id === menuTarget.id) ?? null);
          } else {
            setFolderTarget(data.folders.find((f) => f.id === menuTarget.id) ?? null);
          }
        }}
        onNewList={
          menuTarget?.kind === 'folder'
            ? () => {
                const folder = data.folders.find((f) => f.id === menuTarget.id) ?? null;
                closeDrawer();
                setNewList({ folder });
              }
            : undefined
        }
      />
      <ListOptionsSheet list={listTarget} onClose={() => setListTarget(null)} />
      <FolderOptionsSheet folder={folderTarget} onClose={() => setFolderTarget(null)} />
      <NewListSheet visible={!!newList} folder={newList?.folder ?? null} onClose={() => setNewList(null)} />
      <NewFolderSheet visible={newFolderOpen} onClose={() => setNewFolderOpen(false)} />
    </View>
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
function FolderRow({
  folder,
  rail,
  count,
  folded,
  onToggle,
  onPressIn,
  held,
}: {
  folder: FolderDef;
  onPressIn: (point: { x: number; y: number }) => void;
  /** Its menu is open. See `heldRowBg`. */
  held: boolean;
  /** The collapsed icon-only sidebar, not a folded folder. */
  rail: boolean;
  count: number;
  folded: boolean;
  onToggle: () => void;
}) {
  if (rail) return null;
  return (
    <Pressable
      style={hoverBg([styles.row, held && { backgroundColor: colors.heldRowBg }], held)}
      onPress={onToggle}
      onPressIn={(e) => onPressIn({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      accessibilityLabel={folder.name}
    >
      <View style={styles.chevron}>
        {folded ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
      </View>
      <View style={styles.rowIcon}>
        <IconFolder size={16} color={colors.textTertiary} />
      </View>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {folder.name}
      </Text>
      {count > 0 && <Text style={styles.rowCount}>{count}</Text>}
    </Pressable>
  );
}

function ListRow({
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
  list: ListDef;
  onPressIn: (point: { x: number; y: number }) => void;
  /** Its menu is open. See `heldRowBg`. */
  held: boolean;
  rail: boolean;
  /** 1 when the list sits inside a folder, and is inset under it. */
  depth: 0 | 1;
  count: number;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
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
      onPress={onPress}
      onPressIn={(e) => onPressIn({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      accessibilityLabel={list.name}
    >
      {rail ? (
        <View style={[styles.letterBadge, { backgroundColor: list.color }]}>
          <Text style={styles.letterBadgeText}>{list.name.charAt(0).toUpperCase()}</Text>
        </View>
      ) : (
        <>
          {/* Holds the column a folder's chevron occupies, so every row's icon
              and label line up whether or not it has one. Every list keeps it,
              nested ones included — otherwise the reclaimed column cancels out
              the indent below and a child sits exactly where a root list does. */}
          <View style={styles.chevron} />
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
}

const styles = StyleSheet.create({
  sidebar: {
    // Fixed width in the wide row layout, full height in the drawer panel.
    width: SIDEBAR_WIDTH,
    height: '100%',
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: colors.canvasBg,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    paddingBottom: 12,
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
    fontSize: 17,
    flex: 1,
    color: colors.textPrimary,
    paddingHorizontal: 16,
  },
  scrollArea: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    minHeight: 36,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  tagLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
  },
  rowCount: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.textFaint,
  },
  /** The Tags caption. Folders used to share this and are now rows instead. */
  sectionLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textFaint,
    paddingHorizontal: 10,
    paddingTop: 18,
    paddingBottom: 6,
  },
  /** Both adds share a line, now that a list can be made at the root too. */
  addRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  /** Mirrors the sidebar row metrics so it sits on the same rhythm as the lists. */
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    minHeight: 36,
  },
  /** Matches TaskDetailView's "Add subtask" — the app's other subordinate add row. */
  newLabel: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
  /** Reserves the chevron's column so every row's icon and label line up. */
  chevron: {
    width: 12,
    alignItems: 'center',
  },
  /** One column for whatever marks a row — a folder's icon, a list's dot — so
   *  every label starts at the same x whichever kind of row it is. */
  rowIcon: {
    width: 16,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  letterBadge: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBadgeText: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    color: colors.surface,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

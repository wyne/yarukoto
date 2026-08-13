import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import {
  activeFolders,
  activeTasks,
  inboxCount,
  listCounts,
  listsInFolder,
  tagCounts,
  tasksForToday,
  trashedTasks,
} from '../data/selectors';
import { InboxParams } from '../navigation/types';
import { useSidebar } from '../navigation/SidebarContext';
import { FolderDef, ListDef } from '../data/types';
import ListOptionsSheet from './pickers/ListOptionsSheet';
import FolderOptionsSheet from './pickers/FolderOptionsSheet';
import ServerSheet from './pickers/ServerSheet';
import NewListSheet from './pickers/NewListSheet';
import NewFolderSheet from './pickers/NewFolderSheet';
import SyncIndicator from './SyncIndicator';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconColumns,
  IconFolder,
  IconInboxTray,
  IconPlus,
  IconStack,
  IconTag,
  IconTrash,
} from '../icons/Icons';

export const SIDEBAR_WIDTH = 260;
/** Icon-only rail when the pinned sidebar is collapsed. */
export const SIDEBAR_COLLAPSED_WIDTH = 56;

/** Plan is desktop-only: two panes can't survive a phone-width window. */
function viewsFor(wide: boolean) {
  return [
    { route: 'AllTab', label: 'All', Icon: IconStack },
    { route: 'InboxTab', label: 'Inbox', Icon: IconInboxTray },
    { route: 'TodayTab', label: 'Today', Icon: IconClock },
    { route: 'CalendarTab', label: 'Calendar', Icon: IconCalendar },
    ...(wide ? [{ route: 'PlanTab', label: 'Plan', Icon: IconColumns }] : []),
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
  const [newListFolder, setNewListFolder] = useState<FolderDef | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const { wide, collapsed: collapsedPref, toggleCollapsed } = useSidebar();
  // The drawer is a transient overlay, so it always shows the full sidebar.
  const collapsed = wide && collapsedPref;
  const [serverOpen, setServerOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { state: data, syncStatus } = useTasks();
  const now = new Date();

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

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {viewsFor(wide).map(({ route, label, Icon }) => {
          const active = current.name === route && (route !== 'InboxTab' || !filtered);
          const count = viewCount(route);
          return (
            <Pressable
              key={route}
              style={[styles.row, collapsed && styles.rowCollapsed, active && { backgroundColor: colors.selectedRowBg }]}
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

        {activeFolders(data.folders).map((folder) => {
          const lists = listsInFolder(data.lists, folder.id);
          return (
            <View key={folder.id}>
              {!collapsed && (
                <View style={styles.folderRow}>
                  <Pressable
                    style={styles.folderLabelPress}
                    onLongPress={() => setFolderTarget(folder)}
                    delayLongPress={350}
                    accessibilityLabel={`Edit folder ${folder.name}`}
                  >
                    <Text style={[styles.sectionLabel, styles.folderLabel]} numberOfLines={1}>
                      {folder.name}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setNewListFolder(folder)}
                    hitSlop={8}
                    accessibilityLabel={`New list in ${folder.name}`}
                  >
                    <IconPlus size={12} strokeWidth={1.6} color={colors.textFaint} />
                  </Pressable>
                </View>
              )}
              {lists.map((list) => {
                const active = filterActive('list', list.id);
                return (
                  <Pressable
                    key={list.id}
                    style={[styles.row, collapsed && styles.rowCollapsed, active && { backgroundColor: colors.selectedRowBg }]}
                    onPress={() => openFilter({ listId: list.id })}
                    accessibilityLabel={list.name}
                    onLongPress={() => setListTarget(list)}
                    delayLongPress={350}
                  >
                    {collapsed ? (
                      <View style={[styles.letterBadge, { backgroundColor: list.color }]}>
                        <Text style={styles.letterBadgeText}>{list.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    ) : (
                      <Pressable onPress={() => setListTarget(list)} hitSlop={8} accessibilityLabel={`Change ${list.name} colour`}>
                        <View style={[styles.dot, { backgroundColor: list.color }]} />
                      </Pressable>
                    )}
                    {!collapsed && (
                      <>
                        <Text style={[styles.rowLabel, active && { color: accent, fontFamily: fonts.sansSemiBold }]}>
                          {list.name}
                        </Text>
                        <Text style={styles.rowCount}>{counts[list.id] ?? 0}</Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        {!collapsed && (
          <Pressable style={styles.newFolderRow} onPress={() => setNewFolderOpen(true)} accessibilityLabel="New folder">
            <IconPlus size={15} color={colors.textTertiary} />
            <Text style={styles.newFolderLabel}>New folder</Text>
          </Pressable>
        )}

        {tags.length > 0 && !collapsed && (
          <View>
            <Text style={styles.sectionLabel}>Tags</Text>
            {tags.map(({ tag, count }) => {
              const active = filterActive('tag', tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.row, active && { backgroundColor: colors.selectedRowBg }]}
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
      </ScrollView>

      <Pressable
        style={[styles.footer, collapsed && styles.footerCollapsed, { paddingBottom: Math.max(12, insets.bottom) }]}
        onPress={() => setServerOpen(true)}
        accessibilityLabel="Server connection"
      >
        <SyncIndicator
          mode={data.mode}
          status={syncStatus}
          serverUrl={data.serverUrl}
          compact={collapsed}
        />
      </Pressable>

      <ListOptionsSheet list={listTarget} onClose={() => setListTarget(null)} />
      <FolderOptionsSheet folder={folderTarget} onClose={() => setFolderTarget(null)} />
      <NewListSheet folder={newListFolder} onClose={() => setNewListFolder(null)} />
      <NewFolderSheet visible={newFolderOpen} onClose={() => setNewFolderOpen(false)} />
      <ServerSheet visible={serverOpen} onClose={() => setServerOpen(false)} />
    </View>
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
  /**
   * Only the folder heading flexes; sectionLabel is shared with Tags, which isn't
   * in a row. Its vertical padding moves to the row, otherwise centring the label's
   * lopsided 18/6 box against the icon pushes the text visibly below it.
   */
  folderLabel: {
    flex: 1,
    paddingTop: 0,
    paddingBottom: 0,
  },
  folderLabelPress: {
    flex: 1,
    minWidth: 0,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 6,
    // Trailing inset matches the 10 the rows below are padded by, so the + lines
    // up with their counts.
    paddingRight: 10,
  },
  /** Mirrors the sidebar row metrics so it sits on the same rhythm as the lists. */
  newFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    minHeight: 36,
    marginTop: 4,
  },
  /** Matches TaskDetailView's "Add subtask" — the app's other subordinate add row. */
  newFolderLabel: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    marginHorizontal: 4,
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

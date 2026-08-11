import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import { inboxCount, listCounts, listsInFolder, tagCounts, tasksForToday } from '../data/selectors';
import { TaskListFilter } from '../navigation/types';
import { useSidebar } from '../navigation/SidebarContext';
import { ListDef } from '../data/types';
import ListColorPickerSheet from './pickers/ListColorPickerSheet';
import ServerSheet from './pickers/ServerSheet';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconColumns,
  IconFolder,
  IconInboxTray,
  IconStack,
  IconTag,
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
  ];
}

interface Props extends BottomTabBarProps {
  /** Called after any navigation — the drawer uses it to close itself. */
  onNavigate?: () => void;
}

export default function Sidebar({ state, navigation, onNavigate }: Props) {
  const accent = useAccent();
  const [colorTarget, setColorTarget] = useState<ListDef | null>(null);
  const { wide, collapsed: collapsedPref, toggleCollapsed } = useSidebar();
  // The drawer is a transient overlay, so it always shows the full sidebar.
  const collapsed = wide && collapsedPref;
  const [serverOpen, setServerOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { state: data } = useTasks();
  const now = new Date();

  const counts = listCounts(data.tasks);
  const tags = tagCounts(data.tasks);
  const activeCount = data.tasks.filter((t) => !t.completed).length;

  const current = state.routes[state.index];
  const inboxRoute = state.routes.find((r) => r.name === 'InboxTab');
  const activeFilter = (inboxRoute?.params as { filter?: TaskListFilter } | undefined)?.filter;
  const onInbox = current.name === 'InboxTab';

  const go = (route: string, params?: object) => {
    (navigation.navigate as (name: string, params?: object) => void)(route, params);
    onNavigate?.();
  };

  const viewCount = (route: string): number | null => {
    if (route === 'AllTab') return activeCount;
    if (route === 'InboxTab') return inboxCount(data.tasks);
    if (route === 'TodayTab') return tasksForToday(data.tasks, now).length;
    return null;
  };

  const openFilter = (filter: TaskListFilter) => go('InboxTab', { filter });
  const filterActive = (type: 'list' | 'tag', value: string) =>
    onInbox && activeFilter?.type === type && activeFilter.value === value;

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
          const active = current.name === route && (route !== 'InboxTab' || !activeFilter);
          const count = viewCount(route);
          return (
            <Pressable
              key={route}
              style={[styles.row, collapsed && styles.rowCollapsed, active && { backgroundColor: colors.selectedRowBg }]}
              onPress={() => go(route, route === 'InboxTab' ? { filter: undefined } : undefined)}
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

        {data.folders.map((folder) => {
          const lists = listsInFolder(data.lists, folder.id);
          if (lists.length === 0) return null;
          return (
            <View key={folder.id}>
              {!collapsed && <Text style={styles.sectionLabel}>{folder.name}</Text>}
              {lists.map((list) => {
                const active = filterActive('list', list.id);
                return (
                  <Pressable
                    key={list.id}
                    style={[styles.row, collapsed && styles.rowCollapsed, active && { backgroundColor: colors.selectedRowBg }]}
                    onPress={() => openFilter({ type: 'list', value: list.id, label: list.name })}
                    accessibilityLabel={list.name}
                    onLongPress={() => setColorTarget(list)}
                    delayLongPress={350}
                  >
                    <Pressable onPress={() => setColorTarget(list)} hitSlop={8} accessibilityLabel={`Change ${list.name} colour`}>
                      <View style={[styles.dot, { backgroundColor: list.color }]} />
                    </Pressable>
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

        {tags.length > 0 && !collapsed && (
          <View>
            <Text style={styles.sectionLabel}>Tags</Text>
            {tags.map(({ tag, count }) => {
              const active = filterActive('tag', tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.row, active && { backgroundColor: colors.selectedRowBg }]}
                  onPress={() => openFilter({ type: 'tag', value: tag, label: `#${tag}` })}
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
        accessibilityLabel="Edit server"
      >
        <View style={[styles.syncDot, { backgroundColor: colors.success }]} />
        {!collapsed && (
          <Text style={styles.syncText} numberOfLines={1}>
            {data.serverUrl.replace(/^https?:\/\//, '') || 'Not connected'}
          </Text>
        )}
      </Pressable>

      <ListColorPickerSheet list={colorTarget} onClose={() => setColorTarget(null)} />
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
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    marginHorizontal: 4,
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
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncText: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.textTertiary,
  },
});

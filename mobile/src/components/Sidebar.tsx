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
import { ListDef } from '../data/types';
import ListColorPickerSheet from './pickers/ListColorPickerSheet';
import { IconCalendar, IconClock, IconFolder, IconInboxTray, IconStack, IconTag } from '../icons/Icons';

export const SIDEBAR_WIDTH = 260;

const VIEWS = [
  { route: 'AllTab', label: 'All', Icon: IconStack },
  { route: 'InboxTab', label: 'Inbox', Icon: IconInboxTray },
  { route: 'TodayTab', label: 'Today', Icon: IconClock },
  { route: 'CalendarTab', label: 'Calendar', Icon: IconCalendar },
  { route: 'BrowseTab', label: 'Browse', Icon: IconFolder },
] as const;

interface Props extends BottomTabBarProps {
  /** Called after any navigation — the drawer uses it to close itself. */
  onNavigate?: () => void;
}

export default function Sidebar({ state, navigation, onNavigate }: Props) {
  const accent = useAccent();
  const [colorTarget, setColorTarget] = useState<ListDef | null>(null);
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
    <View style={[styles.sidebar, { paddingTop: insets.top + 14 }]}>
      <Text style={styles.brand}>Yarukoto</Text>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {VIEWS.map(({ route, label, Icon }) => {
          const active = current.name === route && (route !== 'InboxTab' || !activeFilter);
          const count = viewCount(route);
          return (
            <Pressable
              key={route}
              style={[styles.row, active && { backgroundColor: colors.selectedRowBg }]}
              onPress={() => go(route, route === 'InboxTab' ? { filter: undefined } : undefined)}
            >
              <Icon size={18} color={active ? accent : colors.textTertiary} />
              <Text style={[styles.rowLabel, active && { color: accent, fontFamily: fonts.sansSemiBold }]}>
                {label}
              </Text>
              {count !== null && <Text style={styles.rowCount}>{count}</Text>}
            </Pressable>
          );
        })}

        {data.folders.map((folder) => {
          const lists = listsInFolder(data.lists, folder.id);
          if (lists.length === 0) return null;
          return (
            <View key={folder.id}>
              <Text style={styles.sectionLabel}>{folder.name}</Text>
              {lists.map((list) => {
                const active = filterActive('list', list.id);
                return (
                  <Pressable
                    key={list.id}
                    style={[styles.row, active && { backgroundColor: colors.selectedRowBg }]}
                    onPress={() => openFilter({ type: 'list', value: list.id, label: list.name })}
                    onLongPress={() => setColorTarget(list)}
                    delayLongPress={350}
                  >
                    <Pressable onPress={() => setColorTarget(list)} hitSlop={8} accessibilityLabel={`Change ${list.name} colour`}>
                      <View style={[styles.dot, { backgroundColor: list.color }]} />
                    </Pressable>
                    <Text style={[styles.rowLabel, active && { color: accent, fontFamily: fonts.sansSemiBold }]}>
                      {list.name}
                    </Text>
                    <Text style={styles.rowCount}>{counts[list.id] ?? 0}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        {tags.length > 0 && (
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

      <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <View style={[styles.syncDot, { backgroundColor: colors.success }]} />
        <Text style={styles.syncText} numberOfLines={1}>
          {data.serverUrl.replace(/^https?:\/\//, '') || 'Not connected'}
        </Text>
      </View>

      <ListColorPickerSheet list={colorTarget} onClose={() => setColorTarget(null)} />
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
  brand: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingBottom: 12,
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

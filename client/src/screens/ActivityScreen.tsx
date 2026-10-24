import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import Pressable from '../components/HoverPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { useHoverBg } from '../theme/hover';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { useDetailActions } from '../navigation/DetailContext';
import { NATIVE_TAB_CONTENT_PADDING } from '../navigation/nativeTabBarLayout';
import { FLOATING_TAB_BAR } from '../data/platform';
import { createApi } from '../data/api';
import { useSyncStatus, useTasks } from '../data/TaskContext';
import { getListById } from '../data/selectors';
import { ListDef, Task } from '../data/types';
import {
  ACTIVITY_FILTERS,
  ActivityFilter,
  matchesActivityFilter,
  toggleActivityFilter,
} from '../data/activityFilter';
import { ActivityItem, dayKey, dayLabel, summarize, timeLabel } from '../data/activityItems';
import Card from '../components/Card';
import Divider from '../components/Divider';
import GlassIconButton from '../components/GlassIconButton';
import ActivityChanges, { eventColor } from '../components/ActivityChanges';
import { IconMenu } from '../icons/Icons';

const ACTIVITY_PAGE_SIZE = 60;
const ACTIVITY_DAYS_PER_LOAD = 7;
/** How many extra pages a narrow filter may pull on its own to fill the screen. */
const ACTIVITY_FILL_PAGES = 5;

export default function ActivityScreen() {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { wide, openDrawer } = useSidebar();
  const hoverBg = useHoverBg();
  const { openTask } = useDetailActions();
  const { state, syncNow, restoreTasks } = useTasks();
  const syncStatus = useSyncStatus();
  const focused = useIsFocused();
  // What each entry's task is now, which decides what the entry offers: a task
  // still around opens, one in the trash restores, and one purged or no longer
  // shared with you is only history.
  const currentTasks = useMemo(() => new Map(state.tasks.map((t) => [t.id, t])), [state.tasks]);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [visibleDayCount, setVisibleDayCount] = useState(ACTIVITY_DAYS_PER_LOAD);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReadonlySet<ActivityFilter>>(() => new Set());
  const now = useMemo(() => new Date(), []);
  // The task collection the feed was last fetched against, or null when that
  // fetch may have missed something: edits were still waiting to push, so the
  // server had no revision for them yet.
  const fetchedTasksRef = useRef<Task[] | null>(null);
  const tasksRef = useRef(state.tasks);
  tasksRef.current = state.tasks;
  const pendingRef = useRef(syncStatus.pending);
  pendingRef.current = syncStatus.pending;

  const markFetched = useCallback(() => {
    fetchedTasksRef.current = pendingRef.current > 0 ? null : tasksRef.current;
  }, []);

  const loadInitial = useCallback(async () => {
    setVisibleDayCount(ACTIVITY_DAYS_PER_LOAD);
    if (state.mode !== 'server') {
      setItems([]);
      setNextBeforeId(null);
      setHasMore(false);
      setLoaded(true);
      setError(null);
      return;
    }
    setLoaded(false);
    try {
      const api = createApi(state.serverUrl, state.token);
      markFetched();
      const revisions = await api.activity(ACTIVITY_PAGE_SIZE);
      setItems(revisions.flatMap((revision) => summarize(revision, now, state.lists)));
      setNextBeforeId(revisions.at(-1)?.id ?? null);
      setHasMore(revisions.length === ACTIVITY_PAGE_SIZE);
      setError(null);
    } catch {
      setError('Activity could not be loaded.');
    } finally {
      setLoaded(true);
    }
  }, [state.mode, state.serverUrl, state.token, state.lists, now, markFetched]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  /**
   * Brings in what happened since the last fetch without resetting the list:
   * revisions never change once recorded, so new ones are simply prepended. If
   * the newest page no longer reaches what is on screen, it starts over instead
   * of leaving a hole.
   */
  const refreshQuietly = useCallback(async () => {
    if (state.mode !== 'server') return;
    try {
      markFetched();
      const api = createApi(state.serverUrl, state.token);
      const revisions = await api.activity(ACTIVITY_PAGE_SIZE);
      const fresh = revisions.flatMap((revision) => summarize(revision, now, state.lists));
      setItems((current) => {
        const existing = new Set(current.map((item) => item.id));
        const oldest = fresh.at(-1);
        if (current.length === 0 || !oldest || !existing.has(oldest.id)) return fresh;
        const added = fresh.filter((item) => !existing.has(item.id));
        return added.length > 0 ? [...added, ...current] : current;
      });
      setError(null);
    } catch {
      // A missed background refresh is retried on the next sync; the list on
      // screen is still accurate up to when it was fetched.
    }
  }, [state.mode, state.serverUrl, state.token, state.lists, now, markFetched]);

  // The feed is the server's history, so it can only move after a sync: a
  // local edit appears once it has been pushed, and an edit from another
  // device once it has been pulled. Refetch when a sync lands with tasks that
  // differ from the last fetch, and on returning to the screen, which stays
  // mounted behind other tabs.
  useEffect(() => {
    if (!focused || !loaded || syncStatus.pending > 0) return;
    if (fetchedTasksRef.current === state.tasks) return;
    refreshQuietly();
    // state.tasks is read through the ref comparison; a sync landing is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, loaded, syncStatus.lastSyncedAt, syncStatus.pending, refreshQuietly]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNow();
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [syncNow, loadInitial]);

  const groups = useMemo(() => {
    const byDay = new Map<string, ActivityItem[]>();
    for (const item of items) {
      if (!matchesActivityFilter(item.kind, filters)) continue;
      const key = dayKey(item.recordedAt);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return Array.from(byDay.entries());
  }, [items, filters]);
  const visibleGroups = groups.slice(0, visibleDayCount);

  const loadOlder = useCallback(async () => {
    if (loadingMore || refreshing) return;
    if (groups.length > visibleDayCount) {
      setVisibleDayCount((count) => count + ACTIVITY_DAYS_PER_LOAD);
      return;
    }
    if (state.mode !== 'server' || !hasMore || nextBeforeId === null) return;

    setLoadingMore(true);
    try {
      const api = createApi(state.serverUrl, state.token);
      const revisions = await api.activity(ACTIVITY_PAGE_SIZE, nextBeforeId);
      const existing = new Set(items.map((item) => item.id));
      const olderItems = revisions
        .flatMap((revision) => summarize(revision, now, state.lists))
        .filter((item) => !existing.has(item.id));
      if (olderItems.length > 0) {
        setItems((current) => [...current, ...olderItems]);
        setVisibleDayCount((count) => count + ACTIVITY_DAYS_PER_LOAD);
      }
      setNextBeforeId(revisions.at(-1)?.id ?? nextBeforeId);
      setHasMore(revisions.length === ACTIVITY_PAGE_SIZE && olderItems.length > 0);
    } catch {
      setError('Activity could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  }, [
    groups.length,
    hasMore,
    items,
    loadingMore,
    nextBeforeId,
    now,
    refreshing,
    state.lists,
    state.mode,
    state.serverUrl,
    state.token,
    visibleDayCount,
  ]);

  // A narrow filter can leave too few rows to scroll, and so nothing to ask for
  // more. Fetch older pages on its behalf, a few at a time per filter change.
  const fillPagesRef = useRef(0);
  useEffect(() => {
    fillPagesRef.current = 0;
  }, [filters]);
  useEffect(() => {
    if (filters.size === 0 || !loaded || loadingMore || !hasMore) return;
    if (groups.length >= visibleDayCount || fillPagesRef.current >= ACTIVITY_FILL_PAGES) return;
    fillPagesRef.current += 1;
    loadOlder();
  }, [filters, loaded, loadingMore, hasMore, groups.length, visibleDayCount, loadOlder]);

  const handleScroll = useCallback(
    ({ nativeEvent }: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const distanceFromBottom =
        nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y;
      if (distanceFromBottom < 480) loadOlder();
    },
    [loadOlder]
  );

  const empty =
    state.mode !== 'server'
      ? 'Activity is available when connected to a server.'
      : error ||
        (!loaded || loadingMore
          ? 'Loading activity...'
          : filters.size > 0 && items.length > 0
            ? 'No matching activity.'
            : 'No task activity yet.');

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={[styles.header, wide && styles.paneWide]}>
        {!wide && (
          <GlassIconButton onPress={openDrawer} label="Menu" shortcut="toggleSidebar">
            <IconMenu />
          </GlassIconButton>
        )}
        <Text style={styles.title}>Activity</Text>
      </View>
      {state.mode === 'server' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.filterBar, wide && styles.paneWide]}
          contentContainerStyle={styles.filters}
        >
          <Pressable
            onPress={() => setFilters(new Set())}
            accessibilityRole="button"
            accessibilityState={{ selected: filters.size === 0 }}
            style={hoverBg(
              [styles.filter, filters.size === 0 && { backgroundColor: colors.accentTintBg }],
              filters.size === 0
            )}
          >
            <Text style={[styles.filterText, filters.size === 0 && { color: accent }]}>All</Text>
          </Pressable>
          {ACTIVITY_FILTERS.map((filter) => {
            const on = filters.has(filter.id);
            return (
              <Pressable
                key={filter.id}
                onPress={() => setFilters((current) => toggleActivityFilter(current, filter.id))}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={hoverBg([styles.filter, on && { backgroundColor: colors.accentTintBg }], on)}
              >
                <View style={[styles.filterDot, { backgroundColor: eventColor(filter.id, colors) }]} />
                <Text style={[styles.filterText, on && { color: accent }]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textTertiary} />}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        contentContainerStyle={[
          styles.scroll,
          FLOATING_TAB_BAR && !wide && styles.scrollMobileTabs,
          wide && styles.paneWide,
        ]}
      >
        {visibleGroups.length === 0 ? (
          <Text style={styles.empty}>{empty}</Text>
        ) : (
          visibleGroups.map(([day, dayItems]) => (
            <View key={day} style={styles.group}>
              <Text style={styles.day}>{dayLabel(day)}</Text>
              <Card>
                {dayItems.map((item, i) => {
                  const current = currentTasks.get(item.taskId);
                  const trashed = !!current?.deletedAt;
                  return (
                    <View key={item.id}>
                      <Pressable
                        onPress={() => openTask(item.taskId)}
                        disabled={!current || trashed}
                        accessibilityRole={current && !trashed ? 'button' : undefined}
                        style={hoverBg(styles.row, !current || trashed)}
                      >
                        <View style={[styles.dot, { backgroundColor: eventColor(item.kind, colors) }]} />
                        <View style={styles.rowText}>
                          <Text style={[styles.rowTitle, { color: eventColor(item.kind, colors) }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <View style={styles.taskLine}>
                            <Text style={styles.rowTask} numberOfLines={1}>
                              {item.taskTitle}
                            </Text>
                            <ListCrumb lists={state.lists} listId={item.listId} />
                          </View>
                          {!!item.detail && (
                            <Text style={styles.rowMeta} numberOfLines={1}>
                              {item.detail}
                            </Text>
                          )}
                          {!!item.changes?.length && <ActivityChanges changes={item.changes} limit={2} />}
                        </View>
                        <View style={styles.trailing}>
                          <Text style={styles.time}>{timeLabel.format(new Date(item.recordedAt))}</Text>
                          {trashed && item.kind === 'delete' && (
                            <Pressable onPress={() => restoreTasks([item.taskId])} hitSlop={8}>
                              <Text style={[styles.restore, { color: accent }]}>Restore</Text>
                            </Pressable>
                          )}
                        </View>
                      </Pressable>
                      {i < dayItems.length - 1 && <Divider indent={42} />}
                    </View>
                  );
                })}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Where the task lives, so a feed that mixes every list can be read without
 * opening each entry. Drawn like the list crumb in task detail. A list that has
 * since been deleted is left out rather than named from memory.
 */
function ListCrumb({ lists, listId }: { lists: ListDef[]; listId: string | null }) {
  const styles = useStyles();
  const list = getListById(lists, listId);
  if (listId && !list) return null;
  return (
    <View style={styles.crumb}>
      {!!list && <View style={[styles.crumbDot, { backgroundColor: list.color }]} />}
      <Text style={styles.crumbText} numberOfLines={1}>
        {list ? list.name : 'Inbox'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.screenBg },
  paneWide: { width: '100%', maxWidth: PANE_MAX_WIDTH },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: c.textPrimary,
  },
  filterBar: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filters: {
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: c.chipBg,
  },
  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  filterText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: c.textSecondary,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  scrollMobileTabs: {
    paddingBottom: NATIVE_TAB_CONTENT_PADDING,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
  group: {
    marginHorizontal: 12,
    marginBottom: 16,
  },
  day: {
    marginBottom: 7,
    paddingHorizontal: 2,
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 58,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: c.textPrimary,
  },
  taskLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  rowTask: {
    flexShrink: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textSecondary,
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    maxWidth: '45%',
  },
  crumbDot: {
    width: 7,
    height: 7,
    borderRadius: 2,
  },
  crumbText: {
    flexShrink: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 6,
  },
  restore: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13.5,
  },
  time: {
    alignSelf: 'flex-start',
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
}));

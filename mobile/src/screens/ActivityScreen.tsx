import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette } from '../theme/colors';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { NATIVE_TAB_CONTENT_PADDING } from '../navigation/nativeTabBarLayout';
import { WEB_ENTRY } from '../data/platform';
import { notesPlainText } from '../data/notesHtml';
import { ActivityRevision, createApi } from '../data/api';
import { useTasks } from '../data/TaskContext';
import { ListDef, Task } from '../data/types';
import { addDays, formatDueFull, formatDueShort, fromISODate, toISODate } from '../data/dateUtils';
import Card from '../components/Card';
import Divider from '../components/Divider';
import GlassIconButton from '../components/GlassIconButton';
import { IconBell, IconChevronRight, IconMenu } from '../icons/Icons';

type ActivityKind = 'create' | 'edit' | 'complete' | 'delete' | 'restore' | 'reopen';

interface ActivityChange {
  label: string;
  before: string;
  after: string;
}

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  changes?: ActivityChange[];
  taskTitle: string;
  recordedAt: string;
}

/** A function rather than a table, because the colours it names now move. */
function eventColor(kind: ActivityKind, c: Palette): string {
  switch (kind) {
    case 'create':
      return c.success;
    case 'edit':
      return c.priorityLow;
    case 'complete':
      return c.purple;
    case 'delete':
      return c.priorityHigh;
    case 'restore':
      return c.teal;
    case 'reopen':
      return c.orange;
  }
}

const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const timeLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const ACTIVITY_PAGE_SIZE = 60;
const ACTIVITY_DAYS_PER_LOAD = 7;

function dayKey(value: string): string {
  return toISODate(new Date(value));
}

function dayLabel(day: string): string {
  const now = new Date();
  if (day === toISODate(now)) return 'Today';
  if (day === toISODate(addDays(now, -1))) return 'Yesterday';
  return todayLabel.format(fromISODate(day));
}

function compactText(value: string, fallback = 'None'): string {
  return value.replace(/\s+/g, ' ').trim() || fallback;
}

function priorityLabel(value: Task['priority']): string {
  return value === 'none' ? 'None' : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function listLabel(lists: ListDef[], id: string | null): string {
  if (!id) return 'Inbox';
  return lists.find((list) => list.id === id)?.name ?? 'Unknown list';
}

function tagsLabel(tags: string[]): string {
  return tags.length ? tags.map((tag) => `#${tag}`).join(' ') : 'None';
}

function subtasksLabel(task: Task, previous?: Task): string {
  const done = task.subtasks.filter((subtask) => subtask.done).length;
  const previousDone = previous?.subtasks.filter((subtask) => subtask.done).length;
  if (previous && done !== previousDone) return `${done}/${task.subtasks.length} done`;
  if (task.subtasks.length === 0) return 'None';
  return task.subtasks.map((subtask) => compactText(subtask.title, 'Untitled')).join(', ');
}

function changesFor(task: Task, previous: Task | null, lists: ListDef[]): ActivityChange[] {
  if (!previous) return [];
  const changes: ActivityChange[] = [];
  if (task.title !== previous.title) {
    changes.push({ label: 'Title', before: compactText(previous.title, 'Untitled'), after: compactText(task.title, 'Untitled') });
  }
  if (task.notes !== previous.notes) {
    // Notes are HTML, and what a reader would see is what this compares. An
    // edit that only moved the formatting is described rather than printed as
    // two identical lines.
    const before = compactText(notesPlainText(previous.notes));
    const after = compactText(notesPlainText(task.notes));
    changes.push(
      before === after
        ? { label: 'Notes', before, after: 'Formatting changed' }
        : { label: 'Notes', before, after }
    );
  }
  if (task.priority !== previous.priority) {
    changes.push({ label: 'Priority', before: priorityLabel(previous.priority), after: priorityLabel(task.priority) });
  }
  if (task.dueDate !== previous.dueDate || task.dueTime !== previous.dueTime) {
    changes.push({
      label: 'Date',
      before: formatDueFull(previous.dueDate, previous.dueTime),
      after: formatDueFull(task.dueDate, task.dueTime),
    });
  }
  if (task.listId !== previous.listId) {
    changes.push({ label: 'List', before: listLabel(lists, previous.listId), after: listLabel(lists, task.listId) });
  }
  if (JSON.stringify(task.tags) !== JSON.stringify(previous.tags)) {
    changes.push({ label: 'Tags', before: tagsLabel(previous.tags), after: tagsLabel(task.tags) });
  }
  if (JSON.stringify(task.subtasks) !== JSON.stringify(previous.subtasks)) {
    changes.push({
      label: 'Subtasks',
      before: subtasksLabel(previous),
      after: subtasksLabel(task, previous),
    });
  }
  if (task.order !== previous.order) {
    changes.push({
      label: 'Position',
      before: 'Previous',
      after: task.order < previous.order ? 'Moved earlier' : 'Moved later',
    });
  }
  return changes;
}

function editTitle(changes: ActivityChange[]): string {
  if (changes.length === 1) return `Edited ${changes[0].label.toLowerCase()}`;
  return `Edited ${changes.length} fields`;
}

function summarize(revision: ActivityRevision, now: Date, lists: ListDef[]): ActivityItem[] {
  const { task, previousTask, op } = revision;
  const taskTitle = task.title.trim() || previousTask?.title.trim() || 'Untitled task';
  const changes = changesFor(task, previousTask, lists);
  const due = formatDueShort(now, task.dueDate, task.dueTime);

  if (op === 'create') {
    const items: ActivityItem[] = [];
    // Older servers recorded only the final snapshot when a task was created
    // and changed again before its first sync. Expand those combined revisions
    // so existing history is useful too; newer servers emit separate rows.
    if (task.deletedAt) {
      items.push({ id: `${revision.id}-deleted`, kind: 'delete', title: 'Deleted task', taskTitle, recordedAt: revision.recordedAt });
    }
    if (task.completed) {
      items.push({ id: `${revision.id}-completed`, kind: 'complete', title: 'Completed task', taskTitle, recordedAt: revision.recordedAt });
    }
    items.push({
      id: String(revision.id),
      kind: 'create',
      title: 'Created task',
      taskTitle,
      detail: due ? `Due ${due}` : undefined,
      recordedAt: revision.recordedAt,
    });
    return items;
  }
  if (op === 'delete' || task.deletedAt) {
    return [{ id: String(revision.id), kind: 'delete', title: 'Deleted task', taskTitle, recordedAt: revision.recordedAt }];
  }
  if (op === 'restore') {
    return [{ id: String(revision.id), kind: 'restore', title: 'Restored task', taskTitle, recordedAt: revision.recordedAt }];
  }

  const items: ActivityItem[] = [];
  if (previousTask && !previousTask.completed && task.completed) {
    items.push({ id: `${revision.id}-completed`, kind: 'complete', title: 'Completed task', taskTitle, recordedAt: revision.recordedAt });
  }
  if (previousTask && previousTask.completed && !task.completed) {
    items.push({ id: `${revision.id}-reopened`, kind: 'reopen', title: 'Reopened task', taskTitle, recordedAt: revision.recordedAt });
  }

  if (changes.length > 0) {
    items.push({
      id: `${revision.id}-edited`,
      kind: 'edit',
      title: editTitle(changes),
      taskTitle,
      changes,
      recordedAt: revision.recordedAt,
    });
  }
  if (items.length === 0) {
    items.push({ id: String(revision.id), kind: 'edit', title: 'Edited task', taskTitle, recordedAt: revision.recordedAt });
  }
  return items;
}

export default function ActivityScreen() {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { wide, openDrawer } = useSidebar();
  const { state, syncNow } = useTasks();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [visibleDayCount, setVisibleDayCount] = useState(ACTIVITY_DAYS_PER_LOAD);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

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
  }, [state.mode, state.serverUrl, state.token, state.lists, now]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

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
      const key = dayKey(item.recordedAt);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return Array.from(byDay.entries());
  }, [items]);
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
      : error || (loaded ? 'No task activity yet.' : 'Loading activity...');

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={[styles.header, wide && styles.paneWide]}>
        {!wide && (
          <GlassIconButton onPress={openDrawer} label="Menu">
            <IconMenu />
          </GlassIconButton>
        )}
        <Text style={styles.title}>Activity</Text>
        <IconBell size={20} color={accent} />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textTertiary} />}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        contentContainerStyle={[
          styles.scroll,
          !WEB_ENTRY && !wide && styles.scrollMobileTabs,
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
                {dayItems.map((item, i) => (
                  <View key={item.id}>
                    <View style={styles.row}>
                      <View style={[styles.dot, { backgroundColor: eventColor(item.kind, colors) }]} />
                      <View style={styles.rowText}>
                        <Text style={[styles.rowTitle, { color: eventColor(item.kind, colors) }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.rowTask} numberOfLines={1}>
                          {item.taskTitle}
                        </Text>
                        {!!item.detail && (
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {item.detail}
                          </Text>
                        )}
                        {!!item.changes?.length && (
                          <View style={styles.changes}>
                            {item.changes.slice(0, 2).map((change) => (
                              <View key={change.label} style={styles.changeRow}>
                                <Text style={styles.changeLabel}>{change.label}</Text>
                                <Text style={styles.changeBefore} numberOfLines={1} ellipsizeMode="tail">
                                  {change.before}
                                </Text>
                                <IconChevronRight size={11} color={colors.textFaint} />
                                <Text style={styles.changeAfter} numberOfLines={1} ellipsizeMode="tail">
                                  {change.after}
                                </Text>
                              </View>
                            ))}
                            {item.changes.length > 2 && (
                              <Text style={styles.changeMore}>+{item.changes.length - 2} more</Text>
                            )}
                          </View>
                        )}
                      </View>
                      <Text style={styles.time}>{timeLabel.format(new Date(item.recordedAt))}</Text>
                    </View>
                    {i < dayItems.length - 1 && <Divider indent={42} />}
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
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
  rowTask: {
    marginTop: 2,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textSecondary,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
  changes: {
    marginTop: 6,
    gap: 3,
  },
  changeRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  changeLabel: {
    width: 50,
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: c.textTertiary,
  },
  changeBefore: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.textTertiary,
    textDecorationLine: 'line-through',
  },
  changeAfter: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: c.textSecondary,
  },
  changeMore: {
    marginLeft: 55,
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: c.textTertiary,
  },
  time: {
    alignSelf: 'flex-start',
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
}));

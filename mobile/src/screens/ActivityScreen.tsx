import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { MainTabParamList } from '../navigation/types';
import { ActivityRevision, createApi } from '../data/api';
import { useTasks } from '../data/TaskContext';
import { Task } from '../data/types';
import { formatDueShort } from '../data/dateUtils';
import Card from '../components/Card';
import Divider from '../components/Divider';
import GlassIconButton from '../components/GlassIconButton';
import { IconBell, IconMenu } from '../icons/Icons';

type Props = BottomTabScreenProps<MainTabParamList, 'ActivityTab'>;

interface ActivityItem {
  id: string;
  title: string;
  detail?: string;
  taskTitle: string;
  recordedAt: string;
}

const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const timeLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function dayLabel(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (dayKey(value) === dayKey(now.toISOString())) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(value) === dayKey(yesterday.toISOString())) return 'Yesterday';
  return todayLabel.format(date);
}

function sameList(a: Task, b: Task): boolean {
  return a.listId === b.listId;
}

function sameTags(a: Task, b: Task): boolean {
  return a.tags.length === b.tags.length && a.tags.every((tag, i) => tag === b.tags[i]);
}

function sameSubtasks(a: Task, b: Task): boolean {
  return JSON.stringify(a.subtasks) === JSON.stringify(b.subtasks);
}

function changedDetails(task: Task, previous: Task | null): string | undefined {
  if (!previous) return undefined;
  const details: string[] = [];
  if (task.title !== previous.title) details.push('title');
  if (task.notes !== previous.notes) details.push('notes');
  if (task.priority !== previous.priority) details.push('priority');
  if (task.dueDate !== previous.dueDate || task.dueTime !== previous.dueTime) details.push('date');
  if (!sameList(task, previous)) details.push('list');
  if (!sameTags(task, previous)) details.push('tags');
  if (!sameSubtasks(task, previous)) details.push('subtasks');
  return details.length ? details.join(', ') : undefined;
}

function summarize(revision: ActivityRevision, now: Date): ActivityItem[] {
  const { task, previousTask, op } = revision;
  const taskTitle = task.title.trim() || previousTask?.title.trim() || 'Untitled task';
  const detail = changedDetails(task, previousTask);
  const due = formatDueShort(now, task.dueDate, task.dueTime);

  if (op === 'create') {
    const items: ActivityItem[] = [];
    // Older servers recorded only the final snapshot when a task was created
    // and changed again before its first sync. Expand those combined revisions
    // so existing history is useful too; newer servers emit separate rows.
    if (task.deletedAt) {
      items.push({ id: `${revision.id}-deleted`, title: 'Deleted task', taskTitle, recordedAt: revision.recordedAt });
    }
    if (task.completed) {
      items.push({ id: `${revision.id}-completed`, title: 'Completed task', taskTitle, recordedAt: revision.recordedAt });
    }
    items.push({
      id: String(revision.id),
      title: 'Created task',
      taskTitle,
      detail: due || undefined,
      recordedAt: revision.recordedAt,
    });
    return items;
  }
  if (op === 'delete' || task.deletedAt) {
    return [{ id: String(revision.id), title: 'Deleted task', taskTitle, recordedAt: revision.recordedAt }];
  }
  if (op === 'restore') {
    return [{ id: String(revision.id), title: 'Restored task', taskTitle, recordedAt: revision.recordedAt }];
  }
  if (previousTask && !previousTask.completed && task.completed) {
    return [{ id: String(revision.id), title: 'Completed task', taskTitle, recordedAt: revision.recordedAt }];
  }
  if (previousTask && previousTask.completed && !task.completed) {
    return [{ id: String(revision.id), title: 'Reopened task', taskTitle, recordedAt: revision.recordedAt }];
  }
  return [
    {
      id: String(revision.id),
      title: detail ? `Edited ${detail}` : 'Edited task',
      taskTitle,
      recordedAt: revision.recordedAt,
    },
  ];
}

export default function ActivityScreen({}: Props) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { wide, openDrawer } = useSidebar();
  const { state, syncNow } = useTasks();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    if (state.mode !== 'server') {
      setItems([]);
      setLoaded(true);
      setError(null);
      return;
    }
    try {
      const api = createApi(state.serverUrl, state.token);
      const revisions = await api.activity(120);
      setItems(revisions.flatMap((revision) => summarize(revision, now)));
      setError(null);
    } catch {
      setError('Activity could not be loaded.');
    } finally {
      setLoaded(true);
    }
  }, [state.mode, state.serverUrl, state.token, now]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNow();
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [syncNow, load]);

  const groups = useMemo(() => {
    const byDay = new Map<string, ActivityItem[]>();
    for (const item of items) {
      const key = dayKey(item.recordedAt);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return Array.from(byDay.entries());
  }, [items]);

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
        contentContainerStyle={[styles.scroll, wide && styles.paneWide]}
      >
        {groups.length === 0 ? (
          <Text style={styles.empty}>{empty}</Text>
        ) : (
          groups.map(([day, dayItems]) => (
            <View key={day} style={styles.group}>
              <Text style={styles.day}>{dayLabel(dayItems[0].recordedAt)}</Text>
              <Card>
                {dayItems.map((item, i) => (
                  <View key={item.id}>
                    <View style={styles.row}>
                      <View style={[styles.dot, { backgroundColor: accent }]} />
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
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
    color: colors.textPrimary,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
  group: {
    marginHorizontal: 12,
    marginBottom: 16,
  },
  day: {
    marginBottom: 7,
    paddingHorizontal: 2,
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 58,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowTask: {
    marginTop: 2,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: colors.textTertiary,
  },
  time: {
    alignSelf: 'flex-start',
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: colors.textTertiary,
  },
});

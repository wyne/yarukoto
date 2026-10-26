import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useColors } from '../theme/ThemeContext';
import { useFieldFocus } from '../theme/focus';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { NATIVE_TAB_CONTENT_PADDING } from '../navigation/nativeTabBarLayout';
import { useDetail } from '../navigation/DetailContext';
import { FINE_POINTER, FLOATING_TAB_BAR } from '../data/platform';
import { useTasks } from '../data/TaskContext';
import { archivedTasks } from '../data/selectors';
import { ARCHIVE_AFTER_DAYS, completedOn } from '../data/retention';
import { taskMatcher } from '../data/taskFilter';
import { useSyncRefresh } from '../data/useSyncRefresh';
import { useRowContext } from '../components/useRowContext';
import { closeOpenSwipeRow } from '../components/SwipeableRow';
import Card from '../components/Card';
import Divider from '../components/Divider';
import GlassIconButton from '../components/GlassIconButton';
import TaskRow from '../components/TaskRow';
import { IconMenu } from '../icons/Icons';
import type { Task } from '../data/types';

/** "October 2026", the month a task was finished in. */
function monthOf(task: Task): string {
  const at = completedOn(task);
  if (!at) return '';
  return new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Tasks finished more than `ARCHIVE_AFTER_DAYS` ago, newest first and grouped by
 * month.
 *
 * Nothing moves a task here: the archive is a rule over when it was completed, so
 * reopening one from this screen puts it straight back in its list.
 */
export default function ArchiveScreen() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const refreshControl = useSyncRefresh();
  const { wide, openDrawer } = useSidebar();
  const { openTask, openTaskId } = useDetail();
  const { state, toggleComplete, scheduleToday, snoozeTask, scheduleNextWeek } = useTasks();
  const rowContext = useRowContext();
  const searchFocus = useFieldFocus();
  const [query, setQuery] = useState('');
  const now = new Date();

  const archived = useMemo(
    () => archivedTasks(state.tasks, now),
    // A fresh `now` every render would defeat the memo; a task crosses into the
    // archive by the day, which the next render catches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.tasks]
  );
  const tasks = useMemo(() => archived.filter(taskMatcher(query)), [archived, query]);
  const months = useMemo(() => {
    const out: { label: string; tasks: Task[] }[] = [];
    for (const task of tasks) {
      const label = monthOf(task);
      if (out.at(-1)?.label === label) out.at(-1)!.tasks.push(task);
      else out.push({ label, tasks: [task] });
    }
    return out;
  }, [tasks]);
  const listsById = useMemo(() => new Map(state.lists.map((list) => [list.id, list])), [state.lists]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={[styles.header, wide && styles.paneWide]}>
        {!wide && (
          <GlassIconButton onPress={openDrawer} label="Menu" shortcut="toggleSidebar">
            <IconMenu />
          </GlassIconButton>
        )}
        <Text style={styles.title}>Archive</Text>
        <Text style={styles.count}>{archived.length}</Text>
      </View>

      {archived.length > 0 && (
        <View style={[styles.searchRow, wide && styles.paneWide]}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search the archive"
            placeholderTextColor={colors.textFaint}
            style={[styles.searchInput, searchFocus.focusStyle]}
            {...searchFocus.focusProps}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      )}

      <ScrollView
        refreshControl={refreshControl}
        onScrollBeginDrag={closeOpenSwipeRow}
        contentContainerStyle={[
          styles.scroll,
          FLOATING_TAB_BAR && !wide && styles.scrollMobileTabs,
          wide && styles.paneWide,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {archived.length === 0 ? (
          <Text style={styles.empty}>
            Nothing archived yet. Tasks move here {ARCHIVE_AFTER_DAYS} days after you complete them.
          </Text>
        ) : tasks.length === 0 ? (
          <Text style={styles.empty}>No matches.</Text>
        ) : (
          <>
            <Text style={styles.note}>
              Completed more than {ARCHIVE_AFTER_DAYS} days ago. Reopen a task to put it back in its list.
            </Text>
            {months.map((month) => (
              <View key={month.label}>
                <Text style={styles.month}>{month.label}</Text>
                <Card style={styles.card}>
                  {month.tasks.map((task, i) => (
                    <View key={task.id}>
                      <TaskRow
                        task={task}
                        list={task.listId ? listsById.get(task.listId) : undefined}
                        now={now}
                        showContext={rowContext}
                        active={openTaskId === task.id}
                        onPress={() => openTask(task.id)}
                        onToggleComplete={() => toggleComplete(task.id)}
                        onToday={() => scheduleToday(task.id)}
                        onLater={() => snoozeTask(task.id)}
                        onNextWeek={() => scheduleNextWeek(task.id)}
                        hideDue
                      />
                      {i < month.tasks.length - 1 && (
                        <Divider railColor={task.listId ? listsById.get(task.listId)?.color : undefined} />
                      )}
                    </View>
                  ))}
                </Card>
              </View>
            ))}
          </>
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
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: {
    fontFamily: FINE_POINTER ? fonts.sansSemiBold : fonts.sansBold,
    fontSize: FINE_POINTER ? 16 : 22,
    color: c.textPrimary,
  },
  count: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 13.5,
    color: c.textTertiary,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchInput: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
    backgroundColor: c.chipBg,
    // Transparent until focused, when useFieldFocus tints it.
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  /** `flexGrow` reaches the bottom on a short list. See TaskListScreen's `scrollContent`. */
  scroll: { flexGrow: 1, paddingBottom: 24 },
  scrollMobileTabs: { paddingBottom: NATIVE_TAB_CONTENT_PADDING },
  note: {
    marginHorizontal: 16,
    marginBottom: 4,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.textTertiary,
  },
  month: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: c.textSecondary,
  },
  card: { marginHorizontal: 12 },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    marginHorizontal: 24,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
}));

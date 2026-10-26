import React, { useMemo, useRef } from 'react';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { useFieldFocus } from '../../theme/focus';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Pressable from '../HoverPressable';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';
import { useSyncRefresh } from '../../data/useSyncRefresh';
import { TaskCriteria, filterTasks } from '../../data/taskFilter';
import { isArchived } from '../../data/retention';
import type { Task } from '../../data/types';
import { PANE_MAX_WIDTH, useSidebar } from '../../navigation/SidebarContext';
import { NATIVE_TAB_CONTENT_PADDING } from '../../navigation/nativeTabBarLayout';
import { FLOATING_TAB_BAR } from '../../data/platform';
import { useDetail } from '../../navigation/DetailContext';
import Card from '../Card';
import Divider from '../Divider';
import TaskRow from '../TaskRow';
import { useRowContext } from '../useRowContext';
import { closeOpenSwipeRow } from '../SwipeableRow';
import FilterBar from './FilterBar';
import SavedFilterBar from './SavedFilterBar';
import { useCommand } from '../../navigation/MenuCommands';
import ShortcutHint from '../ShortcutHint';
import { afterLayersClose } from '../openLayers';

interface Props {
  criteria: TaskCriteria;
  onCriteriaChange: (next: TaskCriteria) => void;
}

/**
 * Search and filter over every task, with the results in place.
 *
 * The screen this backs used to be an index — a second way to reach a list you
 * could already reach from the nav. It answers a different kind of question
 * now: not "where is my Errands list" but "what is overdue and tagged #home",
 * which no amount of navigating gets you to.
 *
 * It carries no width, padding or position of its own. What owns it decides how
 * wide it is — a tab today, and the intent is a column beside the calendar and
 * a pull-out on a phone, neither of which wants a screen's geometry baked in.
 */
export default function BrowseView({ criteria, onCriteriaChange }: Props) {
  const colors = useColors();
  const accent = useAccent();
  const styles = useStyles();
  const { wide } = useSidebar();
  const refreshControl = useSyncRefresh();
  const { openTask, openTaskId } = useDetail();
  const { state, toggleComplete, scheduleToday, snoozeTask, scheduleNextWeek } = useTasks();
  const now = new Date();

  // Edit ▸ Find… (⌘F) on the Mac.
  const searchRef = useRef<TextInput>(null);
  const searchFocus = useFieldFocus();
  // After the command menu it may have come from is gone, as New Task waits.
  useCommand('find', () => afterLayersClose(() => searchRef.current?.focus()));

  const tasks = useMemo(
    () => filterTasks(state.tasks, criteria, { lists: state.lists, now }),
    // `now` is a fresh Date every render and would defeat the memo; the date
    // buckets it feeds only change at midnight, which a re-render will catch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.tasks, state.lists, criteria]
  );

  /**
   * Completed matches a search of open tasks left out, so a query for something
   * long finished says where it is instead of answering "No matches".
   */
  const completedMatches = useMemo(
    () =>
      criteria.status === 'active' && criteria.query.trim()
        ? filterTasks(state.tasks, { ...criteria, status: 'completed' }, { lists: state.lists, now }).length
        : 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.tasks, state.lists, criteria]
  );

  // Archived tasks come last, under their own heading: a search that reaches
  // back years should still lead with what is current.
  const { current, archived } = useMemo(() => {
    const out: { current: Task[]; archived: Task[] } = { current: [], archived: [] };
    for (const task of tasks) (isArchived(task, now) ? out.archived : out.current).push(task);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const listsById = useMemo(
    () => new Map(state.lists.map((list) => [list.id, list])),
    [state.lists]
  );

  // Results span every list, so a row has to say which one it came from — that
  // is the whole point of a cross-cutting search. Only the narrowest layout
  // trades the names away for the tag count.
  const rowContext = useRowContext();

  return (
    <View style={styles.root}>
      <View style={[styles.searchRow, wide && styles.paneWide]}>
        <TextInput
          ref={searchRef}
          value={criteria.query}
          onChangeText={(query) => onCriteriaChange({ ...criteria, query })}
          placeholder="Search tasks and tags"
          placeholderTextColor={colors.textFaint}
          style={[styles.searchInput, searchFocus.focusStyle]}
          {...searchFocus.focusProps}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <ShortcutHint command="find" style={{ right: 24, bottom: 10 }} />
      </View>

      <View style={wide && styles.paneWide}>
        <SavedFilterBar criteria={criteria} onChange={onCriteriaChange} />
        <FilterBar criteria={criteria} onChange={onCriteriaChange} />
      </View>

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
        {tasks.length === 0 && completedMatches === 0 && (
          <Text style={styles.empty}>
            {criteria.query.trim() ? 'No matches.' : 'Nothing to show.'}
          </Text>
        )}
        {[current, archived].map((rows, section) =>
          rows.length === 0 ? null : (
            <View key={section}>
              {section === 1 && <Text style={styles.sectionLabel}>Archived</Text>}
              <Card style={styles.card}>
                {rows.map((task, i) => (
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
                    />
                    {i < rows.length - 1 && (
                      <Divider railColor={task.listId ? listsById.get(task.listId)?.color : undefined} />
                    )}
                  </View>
                ))}
              </Card>
            </View>
          )
        )}
        {completedMatches > 0 && (
          <Pressable
            onPress={() => onCriteriaChange({ ...criteria, status: 'any' })}
            style={styles.moreRow}
            accessibilityRole="button"
          >
            <Text style={styles.moreText}>
              {tasks.length === 0 ? 'No open tasks match. ' : ''}
              {completedMatches} completed {completedMatches === 1 ? 'task matches' : 'tasks match'}
              {' · '}
              <Text style={[styles.moreText, { color: accent }]}>Show</Text>
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: {
    flex: 1,
  },
  /** Centres the content on a wide layout, as every other screen does. */
  paneWide: {
    width: '100%',
    maxWidth: PANE_MAX_WIDTH,
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
  scroll: {
    // Reaches the bottom on a short result set. See TaskListScreen's
    // `scrollContent` for why the content and not the frame.
    flexGrow: 1,
    paddingBottom: 24,
  },
  scrollMobileTabs: {
    paddingBottom: NATIVE_TAB_CONTENT_PADDING,
  },
  card: {
    marginHorizontal: 12,
  },
  sectionLabel: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 6,
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: c.textSecondary,
  },
  moreRow: {
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 6,
  },
  moreText: {
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textTertiary,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
}));

import React, { useMemo } from 'react';
import { useColors } from '../../theme/ThemeContext';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';
import { useSyncRefresh } from '../../data/useSyncRefresh';
import { TaskCriteria, filterTasks } from '../../data/taskFilter';
import { PANE_MAX_WIDTH, useSidebar } from '../../navigation/SidebarContext';
import { NATIVE_TAB_CONTENT_PADDING } from '../../navigation/nativeTabBarLayout';
import { WEB_ENTRY } from '../../data/platform';
import { useDetail } from '../../navigation/DetailContext';
import Card from '../Card';
import Divider from '../Divider';
import TaskRow from '../TaskRow';
import { useRowContext } from '../useRowContext';
import { closeOpenSwipeRow } from '../SwipeableRow';
import FilterBar from './FilterBar';

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
  const styles = useStyles();
  const { wide } = useSidebar();
  const refreshControl = useSyncRefresh();
  const { openTask, openTaskId } = useDetail();
  const { state, toggleComplete, snoozeTask } = useTasks();
  const now = new Date();

  const tasks = useMemo(
    () => filterTasks(state.tasks, criteria, { lists: state.lists, now }),
    // `now` is a fresh Date every render and would defeat the memo; the date
    // buckets it feeds only change at midnight, which a re-render will catch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.tasks, state.lists, criteria]
  );

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
          value={criteria.query}
          onChangeText={(query) => onCriteriaChange({ ...criteria, query })}
          placeholder="Search tasks and tags"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <View style={wide && styles.paneWide}>
        <FilterBar criteria={criteria} onChange={onCriteriaChange} />
      </View>

      <ScrollView
        refreshControl={refreshControl}
        onScrollBeginDrag={closeOpenSwipeRow}
        contentContainerStyle={[
          styles.scroll,
          !WEB_ENTRY && !wide && styles.scrollMobileTabs,
          wide && styles.paneWide,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {tasks.length === 0 ? (
          <Text style={styles.empty}>
            {criteria.query.trim() ? 'No matches.' : 'Nothing to show.'}
          </Text>
        ) : (
          <Card style={styles.card}>
            {tasks.map((task, i) => (
              <View key={task.id}>
                <TaskRow
                  task={task}
                  list={task.listId ? listsById.get(task.listId) : undefined}
                  now={now}
                  showContext={rowContext}
                  active={openTaskId === task.id}
                  onPress={() => openTask(task.id)}
                  onToggleComplete={() => toggleComplete(task.id)}
                  onLater={() => snoozeTask(task.id)}
                  onDone={() => toggleComplete(task.id)}
                />
                {i < tasks.length - 1 && <Divider />}
              </View>
            ))}
          </Card>
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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
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
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
}));

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { priorityColor } from '../../theme/colors';
import { useColors } from '../../theme/ThemeContext';
import { useFieldFocus } from '../../theme/focus';
import { useTasks } from '../../data/TaskContext';
import { getListById } from '../../data/selectors';
import { Task } from '../../data/types';
import TaskRow from '../../components/TaskRow';
import Card from '../../components/Card';
import { closeOpenSwipeRow } from '../../components/SwipeableRow';
import Divider from '../../components/Divider';
import FilterBar from '../../components/browse/FilterBar';
import { EMPTY_CRITERIA, TaskCriteria, filterTasks } from '../../data/taskFilter';
import { SortBy, sortTasks } from '../../data/viewOptions';
import { useDraggable } from '../../drag/useDraggable';
import { useDragActive } from '../../drag/DragContext';
import { useDragSource } from '../../drag/dragSource';
import { hapticSelect } from '../../data/haptics';
import { IconCalendarBox, IconChevronLeft, IconChevronRight } from '../../icons/Icons';
import Pressable from '../../components/HoverPressable';
import Tooltip from '../../components/Tooltip';
import { DESKTOP_UI } from '../../data/platform';

const DEFAULT_CRITERIA: TaskCriteria = { ...EMPTY_CRITERIA, due: ['nodate', 'overdue'] };
const DEFAULT_SORT_BY: SortBy = 'priority';

interface Props {
  width?: number;
  showRightBorder?: boolean;
  /** Puts the pane away; given only where it can be, which is a desktop window. */
  onHide?: () => void;
}

/**
 * What stands in for the pane while it is put away: a strip on the same edge,
 * with the way back, as the collapsed sidebar is.
 */
export function SchedulePaneRail({ onShow }: { onShow: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.rail}>
      <Tooltip label="Show tasks to plan" align="start">
        <Pressable onPress={onShow} style={styles.railButton} accessibilityLabel="Show tasks to plan">
          <IconChevronRight size={18} />
          <IconCalendarBox size={18} color={colors.textSecondary} />
        </Pressable>
      </Tooltip>
    </View>
  );
}

/** Left column of the Plan view: find existing tasks, then drag them onto the calendar. */
export default function SchedulePane({ width = SCHEDULE_PANE_WIDTH, showRightBorder = true, onHide }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const { state } = useTasks();
  const searchFocus = useFieldFocus();
  // A drag is heading for the calendar, not the list — lock the list's scroll so
  // the finger can carry the ghost out without the ScrollView stealing the pan.
  const dragging = useDragActive();
  const now = new Date();

  const [criteria, setCriteria] = useState<TaskCriteria>(DEFAULT_CRITERIA);
  const [sortBy, setSortBy] = useState<SortBy>(DEFAULT_SORT_BY);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const tasks = useMemo(
    () =>
      sortTasks(filterTasks(state.tasks, criteria, { lists: state.lists, now }), {
        groupBy: 'none',
        sortBy,
        arrangements: {},
      }),
    // `now` only affects date buckets; reopening/re-rendering catches changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [criteria, sortBy, state.lists, state.tasks]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const updateCriteria = useCallback((next: TaskCriteria) => {
    setSelectedIds([]);
    setCriteria(next);
  }, []);
  const updateSort = useCallback((next: SortBy) => {
    setSelectedIds([]);
    setSortBy(next);
  }, []);
  const toggleSelected = useCallback((taskId: string) => {
    hapticSelect();
    setSelectedIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    );
  }, []);

  return (
    <View style={[styles.pane, showRightBorder && styles.paneBorder, { width }]}>
      <View style={styles.header}>
        <IconCalendarBox size={18} color={colors.textSecondary} />
        <Text style={styles.title}>Plan task</Text>
        <Text style={styles.count}>{tasks.length}</Text>
        {/* On the pane's own edge, as the sidebar's is, so what it closes is plain. */}
        {onHide && (
          <Tooltip label="Hide tasks to plan">
            <Pressable onPress={onHide} hitSlop={8} accessibilityLabel="Hide tasks to plan">
              <IconChevronLeft size={18} />
            </Pressable>
          </Tooltip>
        )}
      </View>

      <TextInput
        value={criteria.query}
        onChangeText={(query) => updateCriteria({ ...criteria, query })}
        placeholder="Search tasks and tags"
        placeholderTextColor={colors.textFaint}
        style={[styles.searchInput, searchFocus.focusStyle]}
        {...searchFocus.focusProps}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <FilterBar
        criteria={criteria}
        onChange={updateCriteria}
        sortBy={sortBy}
        onSortChange={updateSort}
        // Nothing here is going on the calendar if it is already done.
        showStatus={false}
      />
      <Text style={styles.hint}>
        {DESKTOP_UI
          ? 'Drag a task onto the calendar to plan it. Tap tasks first to move several together.'
          : selectedIds.length > 0
          ? `${selectedIds.length} selected. Long press a selected task to place ${
              selectedIds.length === 1 ? 'it' : 'them'
            } on the calendar.`
          : 'Long press a task to place it on the calendar. Tap tasks to select multiple.'}
      </Text>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={closeOpenSwipeRow}
        scrollEnabled={!dragging}
      >
        {tasks.length === 0 ? (
          <Text style={styles.empty}>Nothing here.</Text>
        ) : (
          <Card>
            {tasks.map((task, i) => (
              <View key={task.id}>
                <DraggableTask
                  task={task}
                  now={now}
                  selectedIds={selectedIds}
                  selected={selectedIdSet.has(task.id)}
                  onToggleSelected={() => toggleSelected(task.id)}
                />
                {i < tasks.length - 1 && (
                  <Divider railColor={getListById(state.lists, task.listId)?.color} />
                )}
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * A row that can be dragged onto the calendar. The drag handlers sit on a wrapper
 * so TaskRow keeps its own tap and swipe behaviour untouched.
 */
function DraggableTask({
  task,
  now,
  selectedIds,
  selected,
  onToggleSelected,
}: {
  task: Task;
  now: Date;
  selectedIds: string[];
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { state, toggleComplete, scheduleToday, snoozeTask, scheduleNextWeek } = useTasks();
  const { onLongPress, ...handlers } = useDraggable({
    taskId: task.id,
    taskIds: selected ? selectedIds : [task.id],
    title: task.title,
  });
  const isSource = useDragSource(task.id);

  return (
    <View style={styles.draggable} {...handlers}>
      <TaskRow
        task={task}
        list={getListById(state.lists, task.listId)}
        now={now}
        showContext="tags"
        selectionMode
        selected={selected}
        selectionColor={priorityColor(task.priority, colors)}
        dragSource={isSource}
        onPress={onToggleSelected}
        onLongPress={onLongPress}
        onToggleComplete={() => toggleComplete(task.id)}
        onToday={() => scheduleToday(task.id)}
        onLater={() => snoozeTask(task.id)}
        onNextWeek={() => scheduleNextWeek(task.id)}
      />
    </View>
  );
}

export const SCHEDULE_PANE_WIDTH = 320;

const useStyles = makeStyles((c) => ({
  /**
   * If the sweep selects text, the browser fires selectionchange (refusable) and
   * can then start a native text drag — dragstart, which terminates the responder
   * with no refusal hook. Making rows unselectable stops both at the source.
   */
  draggable: {
    // Spread as a plain object rather than suppressed line by line: a
    // `@ts-expect-error` inside the builder stops `makeStyles` inferring the
    // sheet's shape at all, and every style name goes missing.
    ...({ userSelect: 'none', cursor: 'grab' } as object),
  },
  pane: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: c.screenBg,
  },
  // Over the calendar beside it, which the tooltip hangs out across.
  rail: {
    zIndex: 2,
    alignItems: 'center',
    width: 44,
    paddingTop: 10,
    borderRightWidth: 1,
    borderRightColor: c.border,
  },
  railButton: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  paneBorder: {
    borderRightWidth: 1,
    borderRightColor: c.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: c.textPrimary,
  },
  count: {
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
    color: c.textTertiary,
  },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
    backgroundColor: c.chipBg,
    // Transparent until focused, when useFieldFocus tints it.
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  hint: {
    marginHorizontal: 16,
    marginBottom: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 13.5,
    color: c.textTertiary,
  },
  scroll: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.sansRegular,
    fontSize: 14.5,
    color: c.textTertiary,
  },
}));

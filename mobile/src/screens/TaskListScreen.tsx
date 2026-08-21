import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import {
  activeTasks,
  completedInboxTasks,
  completedTasksList,
  getListById,
  inboxTasks,
  tasksForToday,
} from '../data/selectors';
import { isSameDay, toISODate } from '../data/dateUtils';
import { QuickAddDefaults } from '../data/TaskContext';
import { WEB_ENTRY } from '../data/platform';
import { TaskGroup, groupTasks, hasArrangement, viewKey } from '../data/viewOptions';
import { useCollapsedSections } from '../data/uiPrefs';
import { Task } from '../data/types';
import { TaskListFilter } from '../navigation/types';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { useDetail } from '../navigation/DetailContext';
import TaskRow from '../components/TaskRow';
import Card from '../components/Card';
import Divider from '../components/Divider';
import DragList from '../components/DragList';
import SectionHeader from '../components/SectionHeader';
import QuickAddBar from '../components/QuickAddBar';
import BulkActionBar from '../components/BulkActionBar';
import AddTaskFab from '../components/AddTaskFab';
import ViewOptionsSheet from '../components/ViewOptionsSheet';
import SortOverrideBanner from '../components/SortOverrideBanner';
import DueDatePickerSheet from '../components/pickers/DueDatePickerSheet';
import ListPickerSheet from '../components/pickers/ListPickerSheet';
import TagPickerSheet from '../components/pickers/TagPickerSheet';
import { IconMenu, IconSearch, IconSelectMode, IconViewOptions } from '../icons/Icons';

const TITLES = { all: 'All', inbox: 'Inbox', today: 'Today' } as const;

interface Props {
  mode: 'all' | 'inbox' | 'today';
  filter?: TaskListFilter;
}

export default function TaskListScreen({ mode, filter }: Props) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { wide, openDrawer } = useSidebar();
  const { openTask } = useDetail();
  const {
    state,
    toggleComplete,
    snoozeTask,
    reorderTasks,
    setArrangement,
    clearArrangement,
    deleteTasks,
    bulkUpdate,
    addTaskFromQuickAdd,
    getViewOptions,
    setViewOptions,
  } = useTasks();
  const now = new Date();

  // Hosts every group's DragList; passed down so dragging auto-scrolls the page.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const key = viewKey(mode, filter);
  const options = getViewOptions(key);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sections = useCollapsedSections(key);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  // The Inbox tab doubles as the host for list/tag filtered views, so the untriaged
  // restriction only applies when it's showing the actual Inbox.
  const untriagedOnly = mode === 'inbox' && !filter;

  const { active, completed } = useMemo(() => {
    let a: Task[];
    let c: Task[];
    if (mode === 'today') {
      a = tasksForToday(state.tasks, now);
      c = completedTasksList(state.tasks).filter((t) => t.completedAt && isSameDay(new Date(t.completedAt), now));
    } else if (untriagedOnly) {
      a = inboxTasks(state.tasks);
      c = completedInboxTasks(state.tasks);
    } else {
      a = activeTasks(state.tasks);
      c = completedTasksList(state.tasks);
    }
    if (filter) {
      const matchFilter = (t: (typeof a)[number]) =>
        filter.type === 'list' ? t.listId === filter.value : t.tags.includes(filter.value);
      a = a.filter(matchFilter);
      c = c.filter(matchFilter);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const match = (t: (typeof a)[number]) =>
        t.title.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q));
      a = a.filter(match);
      c = c.filter(match);
    }
    return { active: a, completed: c };
  }, [state.tasks, mode, query, filter, untriagedOnly]);

  const groups = useMemo(
    () => groupTasks(active, options, { lists: state.lists, folders: state.folders, now }),
    [active, options, state.lists, state.folders]
  );

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allSelected = selectedIds.length > 0 && selectedIds.length === active.length;
  const grouped = options.groupBy !== 'none';

  // New tasks inherit whatever dimension this view is scoped to. All and Inbox
  // are unscoped, so tasks created there stay untriaged.
  const quickAddDefaults = ((): QuickAddDefaults | undefined => {
    if (filter?.type === 'list') return { listId: filter.value };
    if (filter?.type === 'tag') return { tags: [filter.value] };
    if (mode === 'today') return { dueDate: toISODate(now) };
    return undefined;
  })();
  const quickAddLabel = filter ? filter.label : mode === 'today' ? 'Today' : undefined;

  // A filtered view implies its list/tag on every row; so does a group header when
  // grouping by the same dimension. The group wins, since it's the narrower scope.
  const filterHideListId = filter?.type === 'list' ? filter.value : undefined;
  const filterHideTag = filter?.type === 'tag' ? filter.value : undefined;

  const groupHide = (groupKey: string) => ({
    hideListId:
      options.groupBy === 'list' && groupKey !== '__inbox' ? groupKey : filterHideListId,
    hideTag:
      options.groupBy === 'tag' && groupKey.startsWith('tag:') ? groupKey.slice(4) : filterHideTag,
  });

  // Every view is draggable. Under a sort the drag wins rather than being undone
  // by the comparator: the view remembers that its order was customised and offers
  // to restore the sort, instead of the drop rewriting the task to match where it
  // landed. Search is the one exception — its results are a transient slice, so an
  // arrangement made inside them wouldn't mean anything once the query clears.
  const canReorder = !selectionMode && !query.trim();

  const handleReorder = (
    groupKey: string,
    nextIds: string[],
    moved: { id: string; prevId: string | null; nextId: string | null }
  ) => {
    // Custom order is a property of the tasks themselves, so it moves the one row.
    // Every other sort records the arrangement against this view and group instead,
    // leaving the tasks — and so every other view — untouched.
    if (options.sortBy === 'manual') reorderTasks(moved.id, moved.prevId, moved.nextId);
    else setArrangement(key, options.sortBy, groupKey, nextIds);
  };

  const arranged = hasArrangement(options.arrangements, options.sortBy);
  const restoreSort = () => clearArrangement(key, options.sortBy);

  const renderTaskCard = (group: TaskGroup) => {
    const tasks = group.tasks;
    const hide = groupHide(group.key);
    return (
    <Card style={{ marginHorizontal: 12 }}>
      <DragList
        items={tasks}
        keyExtractor={(task) => task.id}
        enabled={canReorder}
        scrollableRef={scrollRef}
        onReorder={(ids, moved) => handleReorder(group.key, ids, moved)}
        renderItem={(task, i) => (
          <>
            <TaskRow
              task={task}
              list={getListById(state.lists, task.listId)}
              now={now}
              selectionMode={selectionMode}
              showContext={wide}
              hideListId={hide.hideListId}
              hideTag={hide.hideTag}
              selected={selectedIds.includes(task.id)}
              onPress={() => (selectionMode ? toggleSelected(task.id) : openTask(task.id))}
              onToggleComplete={() => toggleComplete(task.id)}
              onLater={() => snoozeTask(task.id)}
              onDone={() => toggleComplete(task.id)}
            />
            {i < tasks.length - 1 && <Divider />}
          </>
        )}
      />
    </Card>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      {selectionMode ? (
        <View style={[styles.selectHeader, wide && styles.paneWide]}>
          <Pressable onPress={exitSelection}>
            <Text style={[styles.headerAction, { color: accent }]}>Cancel</Text>
          </Pressable>
          <Text style={styles.selectedCount}>{selectedIds.length} selected</Text>
          <Pressable onPress={() => setSelectedIds(allSelected ? [] : active.map((t) => t.id))}>
            <Text style={[styles.headerAction, { color: accent }]}>{allSelected ? 'None' : 'All'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.header, wide && styles.paneWide]}>
          {!wide && (
            <Pressable onPress={openDrawer} hitSlop={8}>
              <IconMenu />
            </Pressable>
          )}
          {searchOpen ? (
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search tasks and tags"
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              onBlur={() => {
                if (!query) setSearchOpen(false);
              }}
            />
          ) : (
            <View style={styles.titleRow}>
              <Text style={styles.title}>{filter ? filter.label : TITLES[mode]}</Text>
              <Text style={styles.count}>{active.length}</Text>
            </View>
          )}
          <Pressable
            onPress={() => {
              setSearchOpen((v) => !v);
              setQuery('');
            }}
            hitSlop={8}
          >
            <IconSearch />
          </Pressable>
          <Pressable onPress={() => setOptionsOpen(true)} hitSlop={8}>
            <IconViewOptions color={grouped || options.sortBy !== 'manual' ? accent : undefined} />
          </Pressable>
          <Pressable onPress={() => setSelectionMode(true)} hitSlop={8}>
            <IconSelectMode />
          </Pressable>
        </View>
      )}

      {arranged && !selectionMode && (
        <View style={wide && styles.paneWide}>
          <SortOverrideBanner sortBy={options.sortBy} onRestore={restoreSort} />
        </View>
      )}

      {/* Outside the ScrollView so it stays put instead of scrolling away. */}
      {WEB_ENTRY && !selectionMode && (
        <View style={[styles.quickAddBand, wide && styles.paneWide]}>
          <QuickAddBar
            onSubmit={(text) => addTaskFromQuickAdd(text, quickAddDefaults)}
            contextLabel={quickAddLabel}
          />
        </View>
      )}

      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          !WEB_ENTRY && styles.scrollContentFab,
          wide && styles.paneWide,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {active.length === 0 && <Text style={styles.empty}>{query ? 'No matches.' : 'Nothing here. Nice work.'}</Text>}

        {active.length > 0 &&
          (grouped ? (
            groups.map((group) => {
              const collapsed = sections.isGroupCollapsed(group.key);
              return (
                <View key={group.key} style={styles.group}>
                  <View style={{ marginHorizontal: 6 }}>
                    <SectionHeader
                      label={group.label}
                      count={group.tasks.length}
                      color={group.color}
                      collapsed={collapsed}
                      onToggle={() => sections.toggleGroup(group.key)}
                    />
                  </View>
                  {!collapsed && renderTaskCard(group)}
                </View>
              );
            })
          ) : (
            renderTaskCard(groups[0])
          ))}

        {completed.length > 0 && (
          <>
            <View style={{ marginHorizontal: 6 }}>
              <SectionHeader
                label={`Completed · ${completed.length}`}
                collapsed={sections.completedCollapsed}
                onToggle={sections.toggleCompleted}
              />
            </View>
            {!sections.completedCollapsed && (
              <Card style={{ marginHorizontal: 12 }}>
                {completed.map((task, i) => (
                  <View key={task.id}>
                    <TaskRow
                      task={task}
                      list={getListById(state.lists, task.listId)}
                      now={now}
                      selectionMode={selectionMode}
            showContext={wide}
                      selected={selectedIds.includes(task.id)}
                      onPress={() =>
                        selectionMode ? toggleSelected(task.id) : openTask(task.id)
                      }
                      onToggleComplete={() => toggleComplete(task.id)}
                      onLater={() => snoozeTask(task.id)}
                      onDone={() => toggleComplete(task.id)}
                    />
                    {i < completed.length - 1 && <Divider />}
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </Animated.ScrollView>

      {!WEB_ENTRY && (
        <AddTaskFab defaults={quickAddDefaults} contextLabel={quickAddLabel} hidden={selectionMode} />
      )}

      {selectionMode && (
        <BulkActionBar
          onSchedule={() => setScheduleOpen(true)}
          onMove={() => setMoveOpen(true)}
          onTag={() => setTagOpen(true)}
          onDelete={() => {
            deleteTasks(selectedIds);
            exitSelection();
          }}
        />
      )}

      <ViewOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        value={options}
        onChange={(next) => {
          setViewOptions(key, next);
          sections.expandAllGroups();
        }}
        onRestore={restoreSort}
      />

      <DueDatePickerSheet
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onApply={(dueDate, dueTime) => {
          bulkUpdate(selectedIds, { dueDate, dueTime });
          exitSelection();
        }}
      />
      <ListPickerSheet
        visible={moveOpen}
        onClose={() => setMoveOpen(false)}
        value={null}
        onApply={(listId) => {
          bulkUpdate(selectedIds, { listId });
          exitSelection();
        }}
      />
      <TagPickerSheet
        visible={tagOpen}
        onClose={() => setTagOpen(false)}
        initialTags={[]}
        onApply={(tags) => {
          selectedIds.forEach((id) => {
            const t = state.tasks.find((x) => x.id === id);
            if (t) bulkUpdate([id], { tags: Array.from(new Set([...t.tags, ...tags])) });
          });
          exitSelection();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  count: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    color: colors.textTertiary,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    padding: 0,
  },
  selectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerAction: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
  selectedCount: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingBottom: 24,
    gap: 12,
  },
  /** Clears the floating button so it never covers the last row. */
  scrollContentFab: {
    paddingBottom: 96,
  },
  quickAddBand: {
    paddingBottom: 2,
  },
  group: {
    gap: 2,
  },
  /** Keeps the list at a readable width instead of stretching across a desktop window. */
  paneWide: {
    width: '100%',
    maxWidth: PANE_MAX_WIDTH,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
});

import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import { activeTasks, completedTasksList, getListById, tasksForToday } from '../data/selectors';
import { isSameDay } from '../data/dateUtils';
import { RootStackParamList, TaskListFilter } from '../navigation/types';
import TaskRow from '../components/TaskRow';
import Card from '../components/Card';
import Divider from '../components/Divider';
import SectionHeader from '../components/SectionHeader';
import QuickAddBar from '../components/QuickAddBar';
import BulkActionBar from '../components/BulkActionBar';
import DueDatePickerSheet from '../components/pickers/DueDatePickerSheet';
import ListPickerSheet from '../components/pickers/ListPickerSheet';
import TagPickerSheet from '../components/pickers/TagPickerSheet';
import { IconMenu, IconSearch, IconSelectMode } from '../icons/Icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  mode: 'inbox' | 'today';
  tabNavigation: any;
  filter?: TaskListFilter;
}

export default function TaskListScreen({ mode, tabNavigation, filter }: Props) {
  const navigation = useNavigation<Nav>();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { state, toggleComplete, snoozeTask, deleteTasks, bulkUpdate, addTaskFromQuickAdd } = useTasks();
  const now = new Date();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  useLayoutEffect(() => {
    tabNavigation?.setOptions?.({
      tabBarStyle: selectionMode ? { display: 'none' } : undefined,
    });
  }, [selectionMode, tabNavigation]);

  const { active, completed } = useMemo(() => {
    let a = mode === 'inbox' ? activeTasks(state.tasks) : tasksForToday(state.tasks, now);
    let c =
      mode === 'inbox'
        ? completedTasksList(state.tasks)
        : completedTasksList(state.tasks).filter((t) => t.completedAt && isSameDay(new Date(t.completedAt), now));
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
  }, [state.tasks, mode, query, filter]);

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allSelected = selectedIds.length > 0 && selectedIds.length === active.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      {selectionMode ? (
        <View style={styles.selectHeader}>
          <Pressable onPress={exitSelection}>
            <Text style={[styles.headerAction, { color: accent }]}>Cancel</Text>
          </Pressable>
          <Text style={styles.selectedCount}>{selectedIds.length} selected</Text>
          <Pressable onPress={() => setSelectedIds(allSelected ? [] : active.map((t) => t.id))}>
            <Text style={[styles.headerAction, { color: accent }]}>{allSelected ? 'None' : 'All'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable onPress={() => tabNavigation.navigate('BrowseTab')} hitSlop={8}>
            <IconMenu />
          </Pressable>
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
            <Pressable
              style={styles.titleRow}
              disabled={!filter}
              onPress={() => tabNavigation.navigate('InboxTab', { filter: undefined })}
            >
              <Text style={styles.title}>{filter ? filter.label : mode === 'inbox' ? 'Inbox' : 'Today'}</Text>
              <Text style={styles.count}>{active.length}</Text>
              {filter && <Text style={[styles.clearFilter, { color: accent }]}>Clear</Text>}
            </Pressable>
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
          <Pressable onPress={() => setSelectionMode(true)} hitSlop={8}>
            <IconSelectMode />
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {mode === 'inbox' && !selectionMode && !filter && <QuickAddBar onSubmit={addTaskFromQuickAdd} />}

        {active.length > 0 ? (
          <Card style={{ marginHorizontal: 12 }}>
            {active.map((task, i) => (
              <View key={task.id}>
                <TaskRow
                  task={task}
                  list={getListById(state.lists, task.listId)}
                  now={now}
                  selectionMode={selectionMode}
                  selected={selectedIds.includes(task.id)}
                  onPress={() =>
                    selectionMode ? toggleSelected(task.id) : navigation.navigate('TaskDetail', { taskId: task.id })
                  }
                  onLongPress={() => {
                    if (!selectionMode) {
                      setSelectionMode(true);
                      setSelectedIds([task.id]);
                    }
                  }}
                  onToggleComplete={() => toggleComplete(task.id)}
                  onLater={() => snoozeTask(task.id)}
                  onDone={() => toggleComplete(task.id)}
                />
                {i < active.length - 1 && <Divider />}
              </View>
            ))}
          </Card>
        ) : (
          <Text style={styles.empty}>{query ? 'No matches.' : 'Nothing here. Nice work.'}</Text>
        )}

        {completed.length > 0 && (
          <>
            <View style={{ marginHorizontal: 6 }}>
              <SectionHeader
                label={`Completed · ${completed.length}`}
                collapsed={completedCollapsed}
                onToggle={() => setCompletedCollapsed((v) => !v)}
              />
            </View>
            {!completedCollapsed && (
              <Card style={{ marginHorizontal: 12 }}>
                {completed.map((task, i) => (
                  <View key={task.id}>
                    <TaskRow
                      task={task}
                      list={getListById(state.lists, task.listId)}
                      now={now}
                      selectionMode={selectionMode}
                      selected={selectedIds.includes(task.id)}
                      onPress={() =>
                        selectionMode ? toggleSelected(task.id) : navigation.navigate('TaskDetail', { taskId: task.id })
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
      </ScrollView>

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
  clearFilter: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    marginLeft: 'auto',
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
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
});

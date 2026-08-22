import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { useDetail } from '../../navigation/DetailContext';
import {
  activeFolders,
  activeTasks,
  getListById,
  inboxTasks,
  listsInFolder,
  tagCounts,
  unscheduledTasks,
} from '../../data/selectors';
import { Task } from '../../data/types';
import TaskRow from '../../components/TaskRow';
import Card from '../../components/Card';
import { closeOpenSwipeRow } from '../../components/SwipeableRow';
import Divider from '../../components/Divider';
import BottomSheet from '../../components/BottomSheet';
import { useDraggable } from '../../drag/useDraggable';
import { useDrag } from '../../drag/DragContext';
import { useDragSource } from '../../drag/dragSource';
import { IconChevronDown } from '../../icons/Icons';

export type Scope =
  | { kind: 'unscheduled' }
  | { kind: 'inbox' }
  | { kind: 'list'; value: string; label: string }
  | { kind: 'tag'; value: string; label: string };

const UNSCHEDULED: Scope = { kind: 'unscheduled' };

function scopeLabel(scope: Scope): string {
  switch (scope.kind) {
    case 'unscheduled':
      return 'Unscheduled';
    case 'inbox':
      return 'Inbox';
    default:
      return scope.label;
  }
}

/** Left column of the Plan view: pick a slice of tasks, then drag them onto the calendar. */
export default function SchedulePane() {
  const accent = useAccent();
  const { state } = useTasks();
  const { openTask } = useDetail();
  // A drag is heading for the calendar, not the list — lock the list's scroll so
  // the finger can carry the ghost out without the ScrollView stealing the pan.
  const { payload } = useDrag();
  const now = new Date();

  const [scope, setScope] = useState<Scope>(UNSCHEDULED);
  const [pickerOpen, setPickerOpen] = useState(false);

  const tasks = useMemo(() => {
    switch (scope.kind) {
      case 'unscheduled':
        return unscheduledTasks(state.tasks);
      case 'inbox':
        return inboxTasks(state.tasks);
      case 'list':
        return activeTasks(state.tasks).filter((t) => t.listId === scope.value);
      case 'tag':
        return activeTasks(state.tasks).filter((t) => t.tags.includes(scope.value));
    }
  }, [scope, state.tasks]);

  const tags = tagCounts(state.tasks);

  return (
    <View style={styles.pane}>
      <Pressable style={styles.scopeBtn} onPress={() => setPickerOpen(true)}>
        <Text style={styles.scopeLabel}>{scopeLabel(scope)}</Text>
        <Text style={styles.scopeCount}>{tasks.length}</Text>
        <IconChevronDown />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={closeOpenSwipeRow}
        scrollEnabled={!payload}
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
                  listName={getListById(state.lists, task.listId)}
                  hideListId={scope.kind === 'list' ? scope.value : undefined}
                  hideTag={scope.kind === 'tag' ? scope.value : undefined}
                  onPress={() => openTask(task.id)}
                />
                {i < tasks.length - 1 && <Divider />}
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Plan from">
        <ScrollView style={{ maxHeight: 420 }}>
          {[UNSCHEDULED, { kind: 'inbox' } as Scope].map((s) => (
            <ScopeRow key={s.kind} label={scopeLabel(s)} active={scope.kind === s.kind} onPress={() => {
              setScope(s);
              setPickerOpen(false);
            }} />
          ))}
          {activeFolders(state.folders).map((folder) => (
            <View key={folder.id}>
              <Text style={styles.sectionLabel}>{folder.name}</Text>
              {listsInFolder(state.lists, folder.id).map((list) => (
                <ScopeRow
                  key={list.id}
                  label={list.name}
                  color={list.color}
                  active={scope.kind === 'list' && scope.value === list.id}
                  onPress={() => {
                    setScope({ kind: 'list', value: list.id, label: list.name });
                    setPickerOpen(false);
                  }}
                />
              ))}
            </View>
          ))}
          {tags.length > 0 && <Text style={styles.sectionLabel}>Tags</Text>}
          {tags.map(({ tag }) => (
            <ScopeRow
              key={tag}
              label={`#${tag}`}
              active={scope.kind === 'tag' && scope.value === tag}
              onPress={() => {
                setScope({ kind: 'tag', value: tag, label: `#${tag}` });
                setPickerOpen(false);
              }}
            />
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

function ScopeRow({
  label,
  color,
  active,
  onPress,
}: {
  label: string;
  color?: string;
  active: boolean;
  onPress: () => void;
}) {
  const accent = useAccent();
  return (
    <Pressable style={styles.scopeRow} onPress={onPress}>
      {color && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.scopeRowText, active && { color: accent, fontFamily: fonts.sansSemiBold }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A row that can be dragged onto the calendar. The drag handlers sit on a wrapper
 * so TaskRow keeps its own tap and swipe behaviour untouched.
 */
function DraggableTask({
  task,
  now,
  listName,
  hideListId,
  hideTag,
  onPress,
}: {
  task: Task;
  now: Date;
  listName: ReturnType<typeof getListById>;
  hideListId?: string;
  hideTag?: string;
  onPress: () => void;
}) {
  const { toggleComplete, snoozeTask } = useTasks();
  const { onLongPress, ...handlers } = useDraggable({ taskId: task.id, title: task.title });
  const isSource = useDragSource(task.id);

  return (
    <View style={styles.draggable} {...handlers}>
      <TaskRow
        task={task}
        list={listName}
        now={now}
        showContext
        dragSource={isSource}
        hideListId={hideListId}
        hideTag={hideTag}
        onPress={onPress}
        onLongPress={onLongPress}
        onToggleComplete={() => toggleComplete(task.id)}
        onLater={() => snoozeTask(task.id)}
        onDone={() => toggleComplete(task.id)}
      />
    </View>
  );
}

export const SCHEDULE_PANE_WIDTH = 320;

const styles = StyleSheet.create({
  /**
   * If the sweep selects text, the browser fires selectionchange (refusable) and
   * can then start a native text drag — dragstart, which terminates the responder
   * with no refusal hook. Making rows unselectable stops both at the source.
   */
  draggable: {
    userSelect: 'none',
    // @ts-expect-error web-only affordance; ignored on native
    cursor: 'grab',
  },
  pane: {
    width: SCHEDULE_PANE_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.screenBg,
  },
  scopeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scopeLabel: {
    flex: 1,
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  scopeCount: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.textTertiary,
  },
  scroll: {
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.sansRegular,
    fontSize: 13.5,
    color: colors.textTertiary,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  scopeRowText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  sectionLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginTop: 12,
    marginBottom: 2,
  },
});

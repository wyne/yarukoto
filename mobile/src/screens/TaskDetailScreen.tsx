import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, priorityColor } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useTasks } from '../data/TaskContext';
import { getListById } from '../data/selectors';
import { formatDueFull, reminderLabel } from '../data/dateUtils';
import { Priority } from '../data/types';
import Card from '../components/Card';
import Divider from '../components/Divider';
import TaskCheckbox from '../components/TaskCheckbox';
import { IconBell, IconCalendarBox, IconDotsHorizontal, IconFolder, IconPlus, IconTag } from '../icons/Icons';
import DueDatePickerSheet from '../components/pickers/DueDatePickerSheet';
import ReminderPickerSheet from '../components/pickers/ReminderPickerSheet';
import ListPickerSheet from '../components/pickers/ListPickerSheet';
import TagPickerSheet from '../components/pickers/TagPickerSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskDetail'>;

const PRIORITIES: { key: Priority; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Med' },
  { key: 'high', label: 'High' },
];

export default function TaskDetailScreen({ route, navigation }: Props) {
  const { taskId } = route.params;
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { state, updateTask, toggleComplete, deleteTasks, addSubtask, toggleSubtask } = useTasks();
  const task = state.tasks.find((t) => t.id === taskId);

  const [dueOpen, setDueOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');

  if (!task) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>This task no longer exists.</Text>
      </View>
    );
  }

  const list = getListById(state.lists, task.listId);
  const folder = list ? state.folders.find((f) => f.id === list.folderId) : undefined;
  const doneCount = task.subtasks.filter((s) => s.done).length;

  const confirmDelete = () => {
    Alert.alert('Delete task?', task.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTasks([task.id]);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={[styles.close, { color: accent }]}>Close</Text>
        </Pressable>
        <Text style={styles.headerCenter}>{list ? list.name : 'Inbox'}</Text>
        <IconDotsHorizontal />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.pad14}>
          <View style={styles.titleRow}>
            <TaskCheckbox completed={task.completed} priority={task.priority} onPress={() => toggleComplete(task.id)} size={22} />
            <TextInput
              value={task.title}
              onChangeText={(v) => updateTask(task.id, { title: v })}
              style={[styles.titleInput, task.completed && styles.titleCompleted]}
              multiline
            />
          </View>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => {
              const active = task.priority === p.key;
              const pColor = p.key === 'none' ? colors.textTertiary : priorityColor(p.key);
              return (
                <Pressable
                  key={p.key}
                  style={[
                    styles.priorityPill,
                    active && p.key === 'high' && { backgroundColor: colors.priorityHighBg, borderColor: colors.priorityHigh },
                    active && p.key !== 'high' && { borderColor: pColor },
                  ]}
                  onPress={() => updateTask(task.id, { priority: p.key })}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      { color: pColor },
                      active && { fontFamily: fonts.sansSemiBold },
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Pressable style={styles.metaRow} onPress={() => setDueOpen(true)}>
            <IconCalendarBox size={18} color={colors.textSecondary} />
            <Text style={styles.metaLabel}>Due</Text>
            <Text style={[styles.metaValue, task.dueDate && { color: accent }]}>
              {formatDueFull(task.dueDate, task.dueTime)}
            </Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={styles.metaRow} onPress={() => setReminderOpen(true)}>
            <IconBell size={18} color={colors.textSecondary} />
            <Text style={styles.metaLabel}>Reminder</Text>
            <Text style={styles.metaValue}>{reminderLabel(task.reminder)}</Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={styles.metaRow} onPress={() => setListOpen(true)}>
            <IconFolder size={18} color={colors.textSecondary} />
            <Text style={styles.metaLabel}>List</Text>
            <Text style={styles.metaValue}>{list ? `${folder?.name} / ${list.name}` : 'Inbox'}</Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={styles.metaRow} onPress={() => setTagOpen(true)}>
            <IconTag size={18} color={colors.textSecondary} />
            <Text style={styles.metaLabelFixed}>Tags</Text>
            <View style={styles.tagsWrap}>
              {task.tags.length === 0 && <Text style={styles.metaValue}>Add tags</Text>}
              {task.tags.map((t) => (
                <View key={t} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>#{t}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        </Card>

        <Card style={[styles.pad14, { marginTop: 12 }]}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <TextInput
            value={task.notes}
            onChangeText={(v) => updateTask(task.id, { notes: v })}
            placeholder="Add notes…"
            placeholderTextColor={colors.textFaint}
            style={styles.notesInput}
            multiline
          />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <View style={styles.subtasksHeader}>
            <Text style={styles.sectionLabel}>Subtasks</Text>
            {task.subtasks.length > 0 && (
              <>
                <Text style={styles.subtaskCount}>
                  {doneCount}/{task.subtasks.length}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: accent, width: `${(doneCount / task.subtasks.length) * 100}%` },
                    ]}
                  />
                </View>
              </>
            )}
          </View>
          {task.subtasks.map((st) => (
            <Pressable key={st.id} style={styles.subtaskRow} onPress={() => toggleSubtask(task.id, st.id)}>
              <TaskCheckbox completed={st.done} priority="none" onPress={() => toggleSubtask(task.id, st.id)} size={17} />
              <Text style={[styles.subtaskText, st.done && styles.subtaskDone]}>{st.title}</Text>
            </Pressable>
          ))}
          {addingSubtask ? (
            <View style={styles.subtaskRow}>
              <TextInput
                autoFocus
                value={newSubtask}
                onChangeText={setNewSubtask}
                placeholder="Subtask title"
                placeholderTextColor={colors.textFaint}
                style={styles.subtaskInput}
                onSubmitEditing={() => {
                  if (newSubtask.trim()) addSubtask(task.id, newSubtask.trim());
                  setNewSubtask('');
                  setAddingSubtask(false);
                }}
                returnKeyType="done"
              />
            </View>
          ) : (
            <Pressable style={styles.subtaskRow} onPress={() => setAddingSubtask(true)}>
              <IconPlus size={15} color={colors.textTertiary} />
              <Text style={styles.addSubtaskText}>Add subtask</Text>
            </Pressable>
          )}
        </Card>

        <Pressable onPress={confirmDelete}>
          <Text style={styles.delete}>Delete task</Text>
        </Pressable>
      </ScrollView>

      <DueDatePickerSheet
        visible={dueOpen}
        onClose={() => setDueOpen(false)}
        initialDate={task.dueDate}
        initialTime={task.dueTime}
        onApply={(dueDate, dueTime) => updateTask(task.id, { dueDate, dueTime })}
      />
      <ReminderPickerSheet
        visible={reminderOpen}
        onClose={() => setReminderOpen(false)}
        value={task.reminder}
        onApply={(reminder) => updateTask(task.id, { reminder })}
      />
      <ListPickerSheet
        visible={listOpen}
        onClose={() => setListOpen(false)}
        value={task.listId}
        onApply={(listId) => updateTask(task.id, { listId })}
      />
      <TagPickerSheet
        visible={tagOpen}
        onClose={() => setTagOpen(false)}
        initialTags={task.tags}
        onApply={(tags) => updateTask(task.id, { tags })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  notFound: {
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    color: colors.textTertiary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  close: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
  headerCenter: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.textTertiary,
  },
  scroll: {
    paddingHorizontal: 12,
    paddingBottom: 32,
    gap: 0,
  },
  pad14: {
    padding: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  titleInput: {
    flex: 1,
    fontFamily: fonts.sansSemiBold,
    fontSize: 19,
    lineHeight: 25,
    color: colors.textPrimary,
    padding: 0,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  priorityPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priorityText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  metaLabel: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  metaLabelFixed: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  metaValue: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  tagsWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  tagChip: {
    backgroundColor: colors.chipBg,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagChipText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  sectionLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  notesInput: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 21,
    color: '#35352F',
    marginTop: 6,
    padding: 0,
    minHeight: 40,
  },
  subtasksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  subtaskCount: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.textTertiary,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.chipBg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 40,
  },
  subtaskText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  subtaskDone: {
    textDecorationLine: 'line-through',
    color: colors.textTertiary,
  },
  subtaskInput: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  addSubtaskText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
  delete: {
    textAlign: 'center',
    paddingVertical: 14,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.priorityHigh,
  },
});

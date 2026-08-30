import React, { useEffect, useRef, useState } from 'react';
import { InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, ScrollViewProps, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { priorityColor } from '../theme/colors';
import { makeStyles } from '../theme/styles';
import { useHoverBg } from '../theme/hover';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { FINE_POINTER } from '../data/platform';
import { useTasks } from '../data/TaskContext';
import { getListById } from '../data/selectors';
import { formatDueFull, formatTime24to12 } from '../data/dateUtils';
import { confirmDestructive } from '../data/confirm';
import { Priority } from '../data/types';
import {
  normalizeReminders,
  reminderOffsetLabel,
  reminderSummary,
  taskPatchForReminders,
} from '../data/reminders';
import Card from './Card';
import Divider from './Divider';
import DragList from './DragList';
import TaskCheckbox from './TaskCheckbox';
import {
  IconCalendarBox,
  IconBell,
  IconChevronDown,
  IconClock,
  IconDotsHorizontal,
  IconPlus,
  IconTag,
  IconTrash,
} from '../icons/Icons';
import DueDateQuickMenu from './pickers/DueDateQuickMenu';
import DueTimeQuickMenu from './pickers/DueTimeQuickMenu';
import ReminderQuickMenu from './pickers/ReminderQuickMenu';
import ListPickerSheet from './pickers/ListPickerSheet';
import TagPickerSheet from './pickers/TagPickerSheet';
import { useNativeDateTimePicker } from '../navigation/DateTimePickerContext';
import { useTaskTextDraft } from './useTaskTextDraft';
import NativeOwnedTextInput from './NativeOwnedTextInput';

interface Props {
  taskId: string;
  onClose: () => void;
  /** 'pane' is the wide-layout third column; 'sheet' is the narrow pull-up. */
  variant: 'pane' | 'sheet';
  /** False while a dismissed sheet remains mounted for its closing animation. */
  active?: boolean;
}

const PRIORITIES: { key: Priority; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Med' },
  { key: 'high', label: 'High' },
];

const KEYBOARD_ACCESSORY_ID = 'task-detail-keyboard-accessory';

export default function TaskDetailView({ taskId, onClose, variant, active = true }: Props) {
  const hoverBg = useHoverBg();
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const {
    state,
    updateTask,
    beginTaskEdit,
    endTaskEdit,
    toggleComplete,
    deleteTasks,
    addSubtask,
    toggleSubtask,
    supportsFeature,
  } = useTasks();
  const presentDateTimePicker = useNativeDateTimePicker();
  const task = state.tasks.find((t) => t.id === taskId);
  const textDraft = useTaskTextDraft({
    taskId,
    task,
    active: active && !!task,
    updateTask,
    beginTaskEdit,
    endTaskEdit,
  });
  // The sheet supplies its own top chrome and safe-area padding.
  const topPad = variant === 'pane' ? insets.top + 6 : 6;

  // In the sheet, the scrollable must be the library's so the sheet's pan gesture
  // coordinates with it: drag down at the top closes the sheet, otherwise the
  // content scrolls. Outside a sheet (the wide-layout pane) it throws, so the
  // plain ScrollView stays for that variant.
  const Scroll: React.ComponentType<ScrollViewProps> =
    variant === 'sheet' ? (BottomSheetScrollView as React.ComponentType<ScrollViewProps>) : ScrollView;

  const [picker, setPicker] = useState<'list' | 'tags' | null>(null);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [focusedSubtaskId, setFocusedSubtaskId] = useState<string | null>(null);
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const subtaskDraftsRef = useRef<Record<string, string>>({});

  // Pushed, not switched: these sit over the detail sheet rather than replacing it.
  const openPicker = (which: 'list' | 'tags') => {
    Keyboard.dismiss();
    setPicker(which);
  };
  const closePicker = () => setPicker(null);
  const openDatePicker = () => {
    if (!task) return;
    Keyboard.dismiss();
    presentDateTimePicker({
      mode: 'date',
      date: task.dueDate,
      time: task.dueTime,
      clearDateLabel: (task.reminders?.length ?? 0) > 0 ? 'Clear date and reminders' : undefined,
      onChange: (dueDate, dueTime) => updateTask(task.id, { dueDate, dueTime }),
    });
  };
  const openTimePicker = () => {
    if (!task) return;
    presentDateTimePicker({
      mode: 'time',
      date: task.dueDate,
      time: task.dueTime,
      onChange: (dueDate, dueTime) => updateTask(task.id, { dueDate, dueTime }),
    });
  };

  const notesRef = useRef<TextInput>(null);
  const subtaskInputRef = useRef<TextInput>(null);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [keyboardInputFocused, setKeyboardInputFocused] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardUp(false);
      setKeyboardInputFocused(false);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (!task) {
    return (
      <View style={[styles.screen, { paddingTop: topPad + 6 }]}>
        <Text style={styles.notFound}>This task no longer exists.</Text>
      </View>
    );
  }

  const list = getListById(state.lists, task.listId);
  const folder = list ? state.folders.find((f) => f.id === list.folderId) : undefined;
  const doneCount = task.subtasks.filter((s) => s.done).length;
  const listLabel = list ? (folder ? `${folder.name} / ${list.name}` : list.name) : 'Inbox';
  const reminders = normalizeReminders(task.reminders);
  const reminderLabel = reminderSummary(reminders);
  const remindersSupported = supportsFeature('taskReminders');

  const confirmDelete = () => {
    confirmDestructive('Delete task?', textDraft.title, () => {
      textDraft.flush();
      deleteTasks([task.id]);
      onClose();
    });
  };

  const reorderSubtasks = (ids: string[]) => {
    const byId = new Map(task.subtasks.map((s) => [s.id, s]));
    const subtasks = ids.map((id) => byId.get(id)).filter((s): s is (typeof task.subtasks)[number] => !!s);
    if (subtasks.length !== task.subtasks.length) return;
    updateTask(task.id, { subtasks });
  };

  const removeSubtask = (subtaskId: string) => {
    const { [subtaskId]: _removed, ...rest } = subtaskDraftsRef.current;
    subtaskDraftsRef.current = rest;
    setSubtaskDrafts(rest);
    if (focusedSubtaskId === subtaskId) setFocusedSubtaskId(null);
    updateTask(task.id, { subtasks: task.subtasks.filter((s) => s.id !== subtaskId) });
  };

  const setSubtaskDraft = (subtaskId: string, title: string) => {
    const next = { ...subtaskDraftsRef.current, [subtaskId]: title };
    subtaskDraftsRef.current = next;
    setSubtaskDrafts(next);
  };

  const commitSubtaskTitle = (subtaskId: string) => {
    const draft = subtaskDraftsRef.current[subtaskId];
    if (draft === undefined) return;
    const subtask = task.subtasks.find((s) => s.id === subtaskId);
    const { [subtaskId]: _removed, ...rest } = subtaskDraftsRef.current;
    subtaskDraftsRef.current = rest;
    setSubtaskDrafts(rest);
    if (!subtask) {
      return;
    }

    const title = draft.trim();
    if (!title || title === subtask.title) return;
    updateTask(task.id, {
      subtasks: task.subtasks.map((s) => (s.id === subtaskId ? { ...s, title } : s)),
    });
  };

  const submitNewSubtask = () => {
    const title = newSubtask.trim();
    if (!title) {
      setNewSubtask('');
      setAddingSubtask(false);
      return;
    }

    addSubtask(task.id, title);
    subtaskInputRef.current?.clear();
    subtaskInputRef.current?.setNativeProps({ text: '' });
    setNewSubtask('');
    requestAnimationFrame(() => subtaskInputRef.current?.focus());
  };

  /**
   * Return in the title moves to the end of the notes. The keyboard never drops,
   * so the field switch reads as one continuous motion.
   */
  const jumpToNotes = () => {
    const notes = notesRef.current;
    if (!notes) return;
    notes.focus();
    // The caret lands where the field last left it; push it past any existing
    // notes once focus has actually landed.
    requestAnimationFrame(() => {
      notes.setNativeProps({ selection: { start: textDraft.notes.length, end: textDraft.notes.length } });
    });
  };

  const submitTitle = () => {
    textDraft.flush();
    jumpToNotes();
  };

  const closeDetail = () => {
    textDraft.flush();
    onClose();
  };

  /** See the title field below: the web deliberately does not wrap. */
  const titleWraps = Platform.OS !== 'web';
  /**
   * Pane only, and deliberately just one field's worth.
   *
   * RCTInputAccessoryComponentView binds to a single input: on didMoveToWindow it
   * takes the *first* view in the window whose inputAccessoryViewID matches, keeps
   * one weak ref to it, and never re-binds. Tagging every input with the same id
   * therefore wires the accessory to whichever mounts first and leaves the rest
   * bare — so the sheet uses a bottom-sheet footer instead.
   */
  const accessoryProps = Platform.OS === 'ios' && variant === 'pane' ? { inputAccessoryViewID: KEYBOARD_ACCESSORY_ID } : {};
  const keyboardTargetProps = {
    onFocus: () => setKeyboardInputFocused(true),
    onBlur: () => setKeyboardInputFocused(false),
  };
  const registerInputWithSheet = variant === 'sheet' && Platform.OS !== 'ios';
  const showFloatingKeyboardDismiss = variant === 'sheet' && Platform.OS !== 'ios' && (keyboardUp || keyboardInputFocused);

  const content = (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <View style={styles.header}>
        {/* Both flanks hold their width so the list stays optically centred. */}
        <View style={styles.headerSide}>
          {variant === 'pane' && (
            <Pressable onPress={closeDetail} hitSlop={8}>
              <Text style={[styles.close, { color: accent }]}>Close</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          style={hoverBg(styles.listCrumb)}
          onPress={() => openPicker('list')}
          accessibilityRole="button"
          accessibilityLabel={`List, ${listLabel}. Move this task`}
        >
          {!!list && <View style={[styles.crumbDot, { backgroundColor: list.color }]} />}
          <Text style={styles.crumbText} numberOfLines={1}>
            {listLabel}
          </Text>
          <IconChevronDown size={11} color={colors.textTertiary} strokeWidth={2} />
        </Pressable>
        <View style={[styles.headerSide, styles.headerSideEnd]}>
          {variant === 'pane' && <IconDotsHorizontal />}
        </View>
      </View>

      <Scroll
        style={styles.scrollView}
        contentContainerStyle={[styles.scroll, Platform.OS !== 'ios' && keyboardUp && styles.scrollKeyboard]}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' && variant === 'sheet'}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={styles.pad14}>
          <View style={styles.titleRow}>
            <TaskCheckbox completed={task.completed} priority={task.priority} onPress={() => toggleComplete(task.id)} size={22} />
            {/*
              Wraps on native, one line on the web.

              A multiline field renders a textarea there, and a textarea is two
              rows tall before anything is typed — it stood taller than the text
              in it and read as an invitation to write a paragraph. Growing one
              to fit its content means measuring and re-measuring on every
              keystroke; a plain input is one line by construction, and a long
              title scrolls rather than wrapping. Native has no such problem, so
              it keeps wrapping.

              Return goes to the notes either way. Only the multiline case needs
              telling — left alone it would put a newline into a title.
            */}
            <NativeOwnedTextInput
              sheet={registerInputWithSheet}
              value={textDraft.title}
              onChangeText={textDraft.setTitle}
              style={[styles.titleInput, task.completed && styles.titleCompleted]}
              multiline={titleWraps}
              returnKeyType="next"
              onSubmitEditing={submitTitle}
              {...(titleWraps ? ({ submitBehavior: 'submit' } as const) : {})}
              {...keyboardTargetProps}
              {...accessoryProps}
              onBlur={() => {
                setKeyboardInputFocused(false);
                textDraft.flush();
              }}
            />
          </View>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <View style={styles.metaRow}>
            <IconCalendarBox size={18} color={colors.textSecondary} />
            <Text style={styles.metaLabelFixed}>Date</Text>
            <DueDateQuickMenu
              date={task.dueDate}
              time={task.dueTime}
              style={styles.metaValueMenu}
              onChange={(dueDate, dueTime) => updateTask(task.id, { dueDate, dueTime })}
              onCustomDate={openDatePicker}
              clearLabel={reminders.length > 0 ? 'Clear date and reminders' : undefined}
            >
              <View style={[styles.metaValueButton, styles.menuValueButton]}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.metaValue, styles.dueValue, task.dueDate && { color: accent }]}
                >
                  {formatDueFull(task.dueDate)}
                </Text>
                <IconChevronDown size={12} color={task.dueDate ? accent : colors.textTertiary} strokeWidth={1.8} />
              </View>
            </DueDateQuickMenu>
          </View>
          {!!task.dueDate && (
            <>
              <Divider indent={44} />
              <View style={styles.metaRow}>
                <IconClock size={18} color={colors.textSecondary} />
                <Text style={styles.metaLabelFixed}>Time</Text>
                <DueTimeQuickMenu
                  time={task.dueTime}
                  style={styles.metaValueMenu}
                  onChange={(dueTime) => updateTask(task.id, { dueTime })}
                  onPickTime={openTimePicker}
                >
                  <View
                    accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                    accessibilityLabel={
                      Platform.OS === 'web'
                        ? undefined
                        : task.dueTime
                          ? `Time, ${formatTime24to12(task.dueTime)}`
                          : 'Time, none'
                    }
                    style={[styles.metaValueButton, styles.menuValueButton]}
                  >
                    <Text style={[styles.metaValue, task.dueTime && { color: accent }]}>
                      {task.dueTime ? formatTime24to12(task.dueTime) : 'None'}
                    </Text>
                    <IconChevronDown
                      size={12}
                      color={task.dueTime ? accent : colors.textTertiary}
                      strokeWidth={1.8}
                    />
                  </View>
                </DueTimeQuickMenu>
              </View>
            </>
          )}
          {!!task.dueDate && remindersSupported && (
            <>
              <Divider indent={44} />
              <View style={styles.metaRow}>
                <IconBell size={18} color={colors.textSecondary} />
                <Text style={styles.metaLabelFixed}>Reminders</Text>
                <ReminderQuickMenu
                  reminders={reminders}
                  dueTime={task.dueTime}
                  style={styles.metaValueMenu}
                  onChange={(next) => updateTask(task.id, taskPatchForReminders(task, next))}
                >
                  <View style={[styles.metaValueButton, styles.menuValueButton]}>
                    {reminders.length === 1 ? (
                      <View style={styles.reminderValue}>
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={[styles.metaValue, styles.reminderMainValue, { color: accent }]}
                        >
                          {reminderOffsetLabel(reminders[0].offsetDays)}
                        </Text>
                        <Text numberOfLines={1} style={styles.reminderTimeValue}>
                          ({formatTime24to12(reminders[0].time)})
                        </Text>
                      </View>
                    ) : (
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[styles.metaValue, styles.dueValue, reminders.length > 0 && { color: accent }]}
                      >
                        {reminderLabel}
                      </Text>
                    )}
                    <IconChevronDown size={12} color={reminders.length > 0 ? accent : colors.textTertiary} strokeWidth={1.8} />
                  </View>
                </ReminderQuickMenu>
              </View>
            </>
          )}
          <Divider indent={44} />
          <Pressable style={hoverBg(styles.metaRow)} onPress={() => openPicker('tags')}>
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
          <Divider indent={44} />
          <View style={styles.metaRow}>
            <Text style={styles.metaLabelFixed}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => {
                const active = task.priority === p.key;
                const pColor = p.key === 'none' ? colors.textTertiary : priorityColor(p.key, colors);
                return (
                  <Pressable
                    key={p.key}
                    style={hoverBg(
                      [
                        styles.priorityPill,
                        active && p.key === 'high' && { backgroundColor: colors.priorityHighBg, borderColor: colors.priorityHigh },
                        active && p.key !== 'high' && { borderColor: pColor },
                      ],
                      active
                    )}
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
          </View>
        </Card>

        <Card style={[styles.pad14, { marginTop: 12 }]}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <NativeOwnedTextInput
            ref={notesRef as never}
            sheet={registerInputWithSheet}
            value={textDraft.notes}
            onChangeText={textDraft.setNotes}
            placeholder="Add notes…"
            placeholderTextColor={colors.textFaint}
            style={styles.notesInput}
            multiline
            scrollEnabled={false}
            {...keyboardTargetProps}
            {...accessoryProps}
            onBlur={() => {
              setKeyboardInputFocused(false);
              textDraft.flush();
            }}
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
          <DragList
            items={task.subtasks}
            keyExtractor={(st) => st.id}
            enabled={task.subtasks.length > 1}
            onReorder={(ids) => reorderSubtasks(ids)}
            renderItem={(st) => (
              <View style={[styles.subtaskRow, FINE_POINTER && task.subtasks.length > 1 && styles.subtaskRowWithHandle]}>
                <TaskCheckbox completed={st.done} priority="none" onPress={() => toggleSubtask(task.id, st.id)} size={17} />
                <NativeOwnedTextInput
                  sheet={registerInputWithSheet}
                  value={subtaskDrafts[st.id] ?? st.title}
                  syncKey={st.title}
                  onChangeText={(title) => setSubtaskDraft(st.id, title)}
                  multiline
                  scrollEnabled={false}
                  returnKeyType="done"
                  submitBehavior="blurAndSubmit"
                  style={[
                    styles.subtaskInput,
                    styles.subtaskTitleInput,
                    st.done && focusedSubtaskId !== st.id && styles.subtaskDone,
                  ]}
                  onFocus={() => {
                    setFocusedSubtaskId(st.id);
                    setKeyboardInputFocused(true);
                  }}
                  onBlur={() => {
                    if (focusedSubtaskId === st.id) setFocusedSubtaskId(null);
                    setKeyboardInputFocused(false);
                    commitSubtaskTitle(st.id);
                  }}
                  onSubmitEditing={() => commitSubtaskTitle(st.id)}
                  {...accessoryProps}
                />
                <View style={styles.subtaskActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${st.title}`}
                    hitSlop={6}
                    style={hoverBg(styles.subtaskIconButton)}
                    onPress={() => removeSubtask(st.id)}
                  >
                    <IconTrash size={15} color={colors.priorityHigh} strokeWidth={1.6} />
                  </Pressable>
                </View>
              </View>
            )}
          />
          {addingSubtask ? (
            <View style={styles.subtaskRow}>
              <IconPlus size={15} color={colors.textTertiary} />
              <NativeOwnedTextInput
                ref={subtaskInputRef as never}
                sheet={registerInputWithSheet}
                autoFocus
                value={newSubtask}
                onChangeText={setNewSubtask}
                placeholder="Subtask title"
                placeholderTextColor={colors.textFaint}
                style={styles.subtaskInput}
                onFocus={() => setKeyboardInputFocused(true)}
                onBlur={() => setKeyboardInputFocused(false)}
                {...accessoryProps}
                onSubmitEditing={submitNewSubtask}
                submitBehavior="submit"
                returnKeyType="next"
              />
            </View>
          ) : (
            <Pressable style={hoverBg(styles.subtaskRow)} onPress={() => setAddingSubtask(true)}>
              <IconPlus size={15} color={colors.textTertiary} />
              <Text style={styles.addSubtaskText}>Add subtask</Text>
            </Pressable>
          )}
        </Card>

        <Pressable onPress={confirmDelete}>
          <Text style={styles.delete}>Delete task</Text>
        </Pressable>
      </Scroll>
      {Platform.OS === 'ios' && variant === 'pane' && (
        <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID} backgroundColor="transparent">
          <View pointerEvents="box-none" style={styles.keyboardAccessory}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss keyboard"
              style={styles.keyboardDismissButton}
              onPress={() => Keyboard.dismiss()}
              hitSlop={8}
            >
              <IconChevronDown size={20} color={colors.textPrimary} strokeWidth={2.2} />
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
      {showFloatingKeyboardDismiss && (
        <View pointerEvents="box-none" style={styles.sheetKeyboardDismissLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss keyboard"
            style={styles.keyboardDismissButton}
            onPress={() => Keyboard.dismiss()}
            hitSlop={8}
          >
            <IconChevronDown size={20} color={colors.textPrimary} strokeWidth={2.2} />
          </Pressable>
        </View>
      )}
      {variant === 'pane' && Platform.OS !== 'ios' && keyboardUp && (
        <Pressable style={styles.dismissBar} onPress={() => Keyboard.dismiss()}>
          <Text style={styles.dismissText}>Done</Text>
        </Pressable>
      )}
      <ListPickerSheet
        visible={picker === 'list'}
        onClose={closePicker}
        value={task.listId}
        onApply={(listId) => updateTask(task.id, { listId })}
      />
      <TagPickerSheet
        visible={picker === 'tags'}
        onClose={closePicker}
        initialTags={task.tags}
        onApply={(tags) => updateTask(task.id, { tags })}
      />
    </View>
  );

  if (variant === 'pane') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    );
  }
  return content;
}

const useStyles = makeStyles((c) => ({
  screen: {
    flex: 1,
    backgroundColor: c.screenBg,
  },
  notFound: {
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    color: c.textTertiary,
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
    fontSize: 16,
  },
  /**
   * Wide enough to balance the crumb against the pane's Close button, and
   * shrinkable so a long list name gets the space instead of pushing off-centre.
   */
  headerSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideEnd: {
    justifyContent: 'flex-end',
  },
  listCrumb: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  crumbDot: {
    width: 8,
    height: 8,
    borderRadius: 2.5,
  },
  crumbText: {
    flexShrink: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
    color: c.textTertiary,
  },
  scroll: {
    paddingHorizontal: 12,
    paddingBottom: 32,
    gap: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollKeyboard: {
    paddingBottom: 92,
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
    color: c.textPrimary,
    padding: 0,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: c.textSecondary,
  },
  priorityRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  priorityPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: c.border,
  },
  priorityText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  metaLabelFixed: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
  },
  metaValue: {
    fontFamily: fonts.monoRegular,
    fontSize: 14,
    color: c.textSecondary,
  },
  metaValueMenu: {
    flex: 1,
  },
  metaValueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    minHeight: 30,
    borderRadius: 8,
    paddingLeft: 8,
  },
  menuValueButton: {
    width: '100%',
  },
  dueValue: {
    flexShrink: 1,
  },
  reminderValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 1,
    minWidth: 0,
    gap: 4,
  },
  reminderMainValue: {
    flexShrink: 1,
  },
  reminderTimeValue: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
  tagsWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  tagChip: {
    backgroundColor: c.chipBg,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagChipText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
    color: c.textSecondary,
  },
  sectionLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  notesInput: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 21,
    color: c.textPrimary,
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
    fontSize: 11.5,
    color: c.textTertiary,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: c.chipBg,
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
  subtaskRowWithHandle: {
    paddingRight: 40,
  },
  subtaskDone: {
    textDecorationLine: 'line-through',
    color: c.textTertiary,
  },
  subtaskInput: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
    padding: 0,
  },
  subtaskTitleInput: {
    minWidth: 0,
    lineHeight: 20,
    paddingVertical: 2,
  },
  subtaskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  subtaskIconButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSubtaskText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
  delete: {
    textAlign: 'center',
    paddingVertical: 14,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.priorityHigh,
  },
  dismissBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dismissText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.textPrimary,
  },
  sheetKeyboardDismissLayer: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
  keyboardAccessory: {
    minHeight: 62,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 12,
    paddingBottom: 10,
  },
  keyboardDismissButton: {
    width: 46,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.glassBorder,
    backgroundColor: c.glassFill,
    shadowColor: c.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
  },
}));

import React, { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, ScrollViewProps, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, priorityColor } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import { activeFolders, getListById, listsInFolder, tagCounts } from '../data/selectors';
import { formatDueFull } from '../data/dateUtils';
import { confirmDestructive } from '../data/confirm';
import { Priority } from '../data/types';
import Card from './Card';
import Divider from './Divider';
import TaskCheckbox from './TaskCheckbox';
import { IconCalendarBox, IconCheckBig, IconDotsHorizontal, IconFolder, IconPlus, IconTag } from '../icons/Icons';
import { DATE_OPTIONS, TIME_OPTIONS } from './pickers/DueDatePickerSheet';

interface Props {
  taskId: string;
  onClose: () => void;
  /** 'pane' is the wide-layout third column; 'sheet' is the narrow pull-up. */
  variant: 'pane' | 'sheet';
}

const PRIORITIES: { key: Priority; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Med' },
  { key: 'high', label: 'High' },
];

/**
 * One height for every meta menu, matching the composer's panel. The menus
 * differ in length — 5 dates, however many lists and tags — and sharing one
 * height keeps the panel stable when switching between them.
 */
const MENU_PANEL_HEIGHT = 222;

export default function TaskDetailView({ taskId, onClose, variant }: Props) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { state, updateTask, toggleComplete, deleteTasks, addSubtask, toggleSubtask } = useTasks();
  const task = state.tasks.find((t) => t.id === taskId);
  // The sheet supplies its own top chrome and safe-area padding.
  const topPad = variant === 'pane' ? insets.top + 6 : 6;

  // In the sheet, the scrollable must be the library's so the sheet's pan gesture
  // coordinates with it: drag down at the top closes the sheet, otherwise the
  // content scrolls. Outside a sheet (the wide-layout pane) it throws, so the
  // plain ScrollView stays for that variant.
  const Scroll: React.ComponentType<ScrollViewProps> =
    variant === 'sheet' ? (BottomSheetScrollView as React.ComponentType<ScrollViewProps>) : ScrollView;

  const [menu, setMenu] = useState<'due' | 'list' | 'tags' | null>(null);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [newTag, setNewTag] = useState('');

  // Inline menus rather than the app's stacked picker sheets, which each open
  // their own RN Modal; nesting those inside the detail sheet is fragile.
  const closeMenu = () => {
    Keyboard.dismiss();
    setMenu(null);
  };
  const toggleMenu = (m: 'due' | 'list' | 'tags') => {
    Keyboard.dismiss();
    setMenu((prev) => (prev === m ? null : m));
  };

  const notesRef = useRef<TextInput>(null);

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
  const knownTags = tagCounts(state.tasks).map((t) => t.tag);
  const allTags = Array.from(new Set([...knownTags, ...task.tags]));

  const toggleTag = (tag: string) => {
    updateTask(task.id, {
      tags: task.tags.includes(tag) ? task.tags.filter((t) => t !== tag) : [...task.tags, tag],
    });
  };

  const addNewTag = () => {
    const t = newTag.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !task.tags.includes(t)) updateTask(task.id, { tags: [...task.tags, t] });
    setNewTag('');
  };

  const confirmDelete = () => {
    confirmDestructive('Delete task?', task.title, () => {
      deleteTasks([task.id]);
      onClose();
    });
  };

  /**
   * Return in the title (sheet only): no newline — a title is one line — the
   * caret jumps to the end of the notes instead. The keyboard never drops, so
   * the field switch reads as one continuous motion.
   */
  const jumpToNotes = () => {
    const notes = notesRef.current;
    if (!notes) return;
    notes.focus();
    // The caret lands where the field last left it; push it past any existing
    // notes once focus has actually landed.
    requestAnimationFrame(() => {
      notes.setNativeProps({ selection: { start: task.notes.length, end: task.notes.length } });
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={[styles.close, { color: accent }]}>Close</Text>
        </Pressable>
        <Text style={styles.headerCenter}>{list ? list.name : 'Inbox'}</Text>
        <IconDotsHorizontal />
      </View>

      <Scroll contentContainerStyle={styles.scroll}>
        <Card style={styles.pad14}>
          <View style={styles.titleRow}>
            <TaskCheckbox completed={task.completed} priority={task.priority} onPress={() => toggleComplete(task.id)} size={22} />
            <TextInput
              value={task.title}
              onChangeText={(v) => updateTask(task.id, { title: v })}
              style={[styles.titleInput, task.completed && styles.titleCompleted]}
              multiline
              {...(variant === 'sheet'
                ? ({ submitBehavior: 'submit', returnKeyType: 'next', onSubmitEditing: jumpToNotes } as const)
                : {})}
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
          <Pressable style={styles.metaRow} onPress={() => toggleMenu('due')}>
            <IconCalendarBox size={18} color={colors.textSecondary} />
            <Text style={styles.metaLabel}>Due</Text>
            <Text style={[styles.metaValue, task.dueDate && { color: accent }]}>
              {formatDueFull(task.dueDate, task.dueTime)}
            </Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={styles.metaRow} onPress={() => toggleMenu('list')}>
            <IconFolder size={18} color={colors.textSecondary} />
            <Text style={styles.metaLabel}>List</Text>
            <Text style={styles.metaValue}>{list ? `${folder?.name} / ${list.name}` : 'Inbox'}</Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={styles.metaRow} onPress={() => toggleMenu('tags')}>
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

        {menu && (
          // Fixed height, and everything scrolls inside it — same as the
          // composer's panels, so switching menus doesn't jiggle the layout.
          <View style={styles.menuPanel}>
            <ScrollView
              contentContainerStyle={styles.menuScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {menu === 'due' && (
                <>
                  <Text style={styles.menuSection}>Date</Text>
                  <View style={styles.chipsRow}>
                    {DATE_OPTIONS.map((opt) => {
                      const val = opt.get(new Date());
                      const active = val === task.dueDate;
                      return (
                        <Pressable
                          key={opt.label}
                          style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
                          onPress={() => {
                            updateTask(task.id, { dueDate: val, dueTime: val ? task.dueTime : undefined });
                            closeMenu();
                          }}
                        >
                          <Text style={[styles.chipText, active && { color: '#fff' }]}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={[styles.menuSection, { marginTop: 10 }]}>Time</Text>
                  <View style={styles.chipsRow}>
                    {TIME_OPTIONS.map((opt) => {
                      const active = opt.value === task.dueTime;
                      const disabled = !task.dueDate;
                      return (
                        <Pressable
                          key={opt.label}
                          disabled={disabled}
                          style={[
                            styles.chip,
                            active && { backgroundColor: accent, borderColor: accent },
                            disabled && styles.chipDisabled,
                          ]}
                          onPress={() => {
                            updateTask(task.id, { dueTime: opt.value });
                            closeMenu();
                          }}
                        >
                          <Text style={[styles.chipText, active && { color: '#fff' }]}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {menu === 'list' && (
                <>
                  <Pressable
                    style={styles.menuRow}
                    onPress={() => {
                      updateTask(task.id, { listId: null });
                      closeMenu();
                    }}
                  >
                    <Text style={styles.menuLabel}>Inbox</Text>
                    {task.listId === null && <IconCheckBig size={14} color={accent} strokeWidth={2.4} />}
                  </Pressable>
                  {activeFolders(state.folders).map((folder) => (
                    <View key={folder.id}>
                      <Text style={styles.menuSection}>{folder.name}</Text>
                      {listsInFolder(state.lists, folder.id).map((list) => (
                        <Pressable
                          key={list.id}
                          style={styles.menuRow}
                          onPress={() => {
                            updateTask(task.id, { listId: list.id });
                            closeMenu();
                          }}
                        >
                          <View style={[styles.listDot, { backgroundColor: list.color }]} />
                          <Text style={styles.menuLabel}>{list.name}</Text>
                          {task.listId === list.id && <IconCheckBig size={14} color={accent} strokeWidth={2.4} />}
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </>
              )}

              {/* Tags stay open on tap — picking several at once is the normal case. */}
              {menu === 'tags' && (
                <>
                  {allTags.length === 0 && <Text style={styles.menuEmpty}>No tags yet — add one below.</Text>}
                  <View style={styles.chipsRow}>
                    {allTags.map((tag) => {
                      const active = task.tags.includes(tag);
                      return (
                        <Pressable
                          key={tag}
                          style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
                          onPress={() => toggleTag(tag)}
                        >
                          <Text style={[styles.chipText, active && { color: '#fff' }]}>#{tag}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.addRow}>
                    <TextInput
                      value={newTag}
                      onChangeText={setNewTag}
                      placeholder="New tag"
                      placeholderTextColor={colors.textFaint}
                      style={styles.input}
                      onSubmitEditing={addNewTag}
                      returnKeyType="done"
                    />
                    <Pressable style={[styles.addBtn, { borderColor: accent }]} onPress={addNewTag}>
                      <Text style={[styles.addBtnText, { color: accent }]}>Add</Text>
                    </Pressable>
                  </View>
                  <Pressable style={styles.doneBtn} onPress={closeMenu}>
                    <Text style={styles.doneText}>Done</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        )}

        <Card style={[styles.pad14, { marginTop: 12 }]}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <TextInput
            ref={notesRef}
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
      </Scroll>
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
  menuPanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    height: MENU_PANEL_HEIGHT,
  },
  menuScrollContent: {
    paddingVertical: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  menuLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  menuSection: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 6,
    fontFamily: fonts.monoRegular,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  menuEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textTertiary,
  },
  listDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  addBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  doneBtn: {
    marginTop: 12,
    marginHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { colors, priorityColor } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { QuickAddDefaults, useTasks } from '../data/TaskContext';
import { Priority } from '../data/types';
import { parseQuickAdd } from '../data/quickAdd';
import { formatDueShort } from '../data/dateUtils';
import { activeFolders, getListById, listsInFolder } from '../data/selectors';
import { applySuggestion, useQuickAddSuggestions } from '../data/quickAddSuggestions';
import { DATE_OPTIONS } from './pickers/DueDatePickerSheet';
import NativeSheet from './NativeSheet';
import { IconCalendarBox, IconCheckBig, IconFlag, IconFolder, IconPlus, IconTag } from '../icons/Icons';

const PRIORITY_MENU: { key: Priority; label: string }[] = [
  { key: 'high', label: 'High Priority' },
  { key: 'medium', label: 'Medium Priority' },
  { key: 'low', label: 'Low Priority' },
  { key: 'none', label: 'No Priority' },
];

/** Which helper menu is open. Only ever one. */
type Menu = 'date' | 'priority' | 'tags' | 'list';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** What the view contributes — the composer starts from these each time it opens. */
  defaults?: QuickAddDefaults;
  contextLabel?: string;
}

/**
 * The task composer: a title field with helper buttons that each open a small
 * menu, in the shape of TickTick's.
 *
 * The menus are rendered in-flow — the gorhom sheet clips to its rounded
 * corners, so an overlay above the toolbar would be cut off — and the sheet
 * grows to fit them. They are deliberately inline rather than the app's
 * existing picker sheets, which each open their own RN Modal; nesting those
 * inside this one is fragile.
 */
export default function TaskComposerSheet({ visible, onClose, defaults, contextLabel }: Props) {
  const accent = useAccent();
  const { state, addTaskFromQuickAdd } = useTasks();
  // BottomSheetTextInput rather than RN's: it registers the field with the sheet,
  // which is how keyboardBehavior knows an input is focused and sizes around it.
  const inputRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);

  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const [dueTime, setDueTime] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<Priority>('none');
  const [tags, setTags] = useState<string[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  // Read through a ref so the reseed below can use the current scope without
  // taking `defaults` as a dependency: the screens build it inline, so it is a
  // fresh object on every render.
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  // Reseed once per open: the view's scope may have changed since last time, and
  // a half-typed task from a previous open shouldn't reappear. Keyed on `visible`
  // alone — keyed on `defaults` too, any parent re-render while the sheet is up
  // (a sync tick is enough) would clear the draft mid-sentence.
  useEffect(() => {
    if (!visible) return;
    const d = defaultsRef.current;
    setText('');
    setDueDate(d?.dueDate);
    setDueTime(d?.dueTime);
    setPriority(d?.priority ?? 'none');
    setTags(d?.tags ?? []);
    setListId(d?.listId ?? null);
    setMenu(null);
  }, [visible]);

  const close = () => {
    // Let the keyboard retreat with the sheet, or the sheet would stop short
    // behind it on the way out.
    Keyboard.dismiss();
    onClose();
  };

  const suggestions = useQuickAddSuggestions(text, state);
  const parsed = text.trim() ? parseQuickAdd(text) : null;

  // Typed tokens win over the buttons, matching how view defaults have always
  // behaved — so the chips show what will actually be created.
  const effective = {
    dueDate: parsed?.dueDate ?? dueDate,
    dueTime: parsed?.dueTime ?? dueTime,
    priority: parsed && parsed.priority !== 'none' ? parsed.priority : priority,
    tags: Array.from(new Set([...tags, ...(parsed?.tags ?? [])])),
    listId: parsed?.listName
      ? (state.lists.find((l) => !l.deletedAt && l.name.toLowerCase() === parsed.listName!.toLowerCase())?.id ??
        listId)
      : listId,
  };

  const dueLabel = formatDueShort(new Date(), effective.dueDate, effective.dueTime);
  const listName = getListById(state.lists, effective.listId)?.name;
  const knownTags = useMemo(
    () => Array.from(new Set(state.tasks.flatMap((t) => t.tags))).sort((a, b) => a.localeCompare(b)),
    [state.tasks]
  );

  const canSubmit = !!(parsed?.title.trim());

  const submit = () => {
    if (!canSubmit) return;
    addTaskFromQuickAdd(text, {
      listId,
      tags,
      dueDate,
      dueTime,
      priority,
    });
    close();
  };

  const chooseSuggestion = (value: string) => {
    setText(applySuggestion(text, value));
    inputRef.current?.focus();
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const helper = (key: Menu, Icon: React.ComponentType<{ size?: number; color?: string }>, active: boolean) => (
    <Pressable
      key={key}
      onPress={() => {
        Keyboard.dismiss();
        setMenu((m) => (m === key ? null : key));
      }}
      hitSlop={6}
      style={[styles.helper, menu === key && styles.helperOpen]}
      accessibilityLabel={key}
    >
      <Icon size={20} color={active ? accent : colors.textTertiary} />
    </Pressable>
  );

  return (
    <NativeSheet
      visible={visible}
      onClose={close}
      keyboard
      grabber={false}
      // Focus when the sheet has been presented, so the keyboard starts rising
      // the moment the sheet begins to slide — one connected motion rather
      // than open-then-keyboard.
      onShow={() => inputRef.current?.focus()}
    >
      <BottomSheetTextInput
        ref={inputRef}
        value={text}
        onChangeText={setText}
        placeholder={contextLabel ? `Add to ${contextLabel}…` : 'What would you like to do?'}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        multiline
        blurOnSubmit={false}
        onSubmitEditing={submit}
        returnKeyType="done"
      />

      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable key={s.value} style={styles.suggestionRow} onPress={() => chooseSuggestion(s.value)}>
              <Text style={styles.suggestionValue}>{s.value}</Text>
              {!!s.hint && <Text style={styles.suggestionHint}>{s.hint}</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {(dueLabel || effective.tags.length > 0 || listName || effective.priority !== 'none') && (
        <View style={styles.chips}>
          {!!dueLabel && (
            <View style={[styles.chip, { backgroundColor: colors.accentTintBg }]}>
              <Text style={[styles.chipText, { color: accent }]}>{dueLabel.toLowerCase()}</Text>
            </View>
          )}
          {!!listName && (
            <View style={[styles.chip, { backgroundColor: colors.chipBg }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]}>{listName}</Text>
            </View>
          )}
          {effective.tags.map((t) => (
            <View key={t} style={[styles.chip, { backgroundColor: colors.chipBg }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]}>#{t}</Text>
            </View>
          ))}
          {effective.priority !== 'none' && (
            <View style={[styles.chip, { backgroundColor: colors.chipBg }]}>
              <Text style={[styles.chipText, { color: priorityColor(effective.priority) }]}>
                !{effective.priority}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.toolbar}>
        {helper('date', IconCalendarBox, !!effective.dueDate)}
        {helper('priority', IconFlag, effective.priority !== 'none')}
        {helper('tags', IconTag, effective.tags.length > 0)}
        {helper('list', IconFolder, effective.listId !== null)}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={[styles.submit, { backgroundColor: canSubmit ? accent : colors.chipBg }]}
          accessibilityLabel="Add task"
        >
          <IconPlus size={18} color={canSubmit ? '#fff' : colors.textFaint} strokeWidth={2.2} />
        </Pressable>
      </View>

      {menu && (
        <View style={styles.menuPanel}>
          {menu === 'priority' &&
              PRIORITY_MENU.map((p) => (
                <Pressable
                  key={p.key}
                  style={styles.menuRow}
                  onPress={() => {
                    setPriority(p.key);
                    setMenu(null);
                  }}
                >
                  <IconFlag size={18} color={priorityColor(p.key)} filled={p.key !== 'none'} />
                  <Text style={styles.menuLabel}>{p.label}</Text>
                  {effective.priority === p.key && <IconCheckBig size={14} color={accent} strokeWidth={2.4} />}
                </Pressable>
              ))}

            {menu === 'date' &&
              DATE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.label}
                  style={styles.menuRow}
                  onPress={() => {
                    const next = opt.get(new Date());
                    setDueDate(next);
                    if (!next) setDueTime(undefined);
                    setMenu(null);
                  }}
                >
                  <IconCalendarBox size={18} color={colors.textTertiary} />
                  <Text style={styles.menuLabel}>{opt.label}</Text>
                  {effective.dueDate === opt.get(new Date()) && (
                    <IconCheckBig size={14} color={accent} strokeWidth={2.4} />
                  )}
                </Pressable>
              ))}

            {menu === 'tags' && (
              <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled">
                {knownTags.length === 0 && <Text style={styles.menuEmpty}>No tags yet — type #name instead.</Text>}
                {knownTags.map((tag) => (
                  <Pressable key={tag} style={styles.menuRow} onPress={() => toggleTag(tag)}>
                    <IconTag size={16} color={colors.textTertiary} />
                    <Text style={styles.menuLabel}>{tag}</Text>
                    {effective.tags.includes(tag) && <IconCheckBig size={14} color={accent} strokeWidth={2.4} />}
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {menu === 'list' && (
              <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled">
                <Pressable
                  style={styles.menuRow}
                  onPress={() => {
                    setListId(null);
                    setMenu(null);
                  }}
                >
                  <Text style={styles.menuLabel}>Inbox</Text>
                  {effective.listId === null && <IconCheckBig size={14} color={accent} strokeWidth={2.4} />}
                </Pressable>
                {activeFolders(state.folders).map((folder) => (
                  <View key={folder.id}>
                    <Text style={styles.menuSection}>{folder.name}</Text>
                    {listsInFolder(state.lists, folder.id).map((list) => (
                      <Pressable
                        key={list.id}
                        style={styles.menuRow}
                        onPress={() => {
                          setListId(list.id);
                          setMenu(null);
                        }}
                      >
                        <View style={[styles.listDot, { backgroundColor: list.color }]} />
                        <Text style={styles.menuLabel}>{list.name}</Text>
                        {effective.listId === list.id && <IconCheckBig size={14} color={accent} strokeWidth={2.4} />}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
      )}
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
    minHeight: 44,
    padding: 0,
    textAlignVertical: 'top',
  },
  suggestions: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 6,
    gap: 2,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  suggestionValue: {
    fontFamily: fonts.monoRegular,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  suggestionHint: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  helper: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  helperOpen: {
    backgroundColor: colors.chipBg,
  },
  submit: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** The helper menus render in-flow so the sheet can grow to fit them. */
  menuPanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  menuScroll: {
    maxHeight: 260,
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
    paddingTop: 10,
    paddingBottom: 4,
    fontFamily: fonts.monoRegular,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  menuEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.textTertiary,
  },
  listDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
});

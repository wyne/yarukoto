import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SlideUpModal from './SlideUpModal';
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
import { IconCalendarBox, IconCheckBig, IconFlag, IconFolder, IconPlus, IconTag } from '../icons/Icons';

const PRIORITY_MENU: { key: Priority; label: string }[] = [
  { key: 'high', label: 'High Priority' },
  { key: 'medium', label: 'Medium Priority' },
  { key: 'low', label: 'Low Priority' },
  { key: 'none', label: 'No Priority' },
];

/** Which helper popover is open. Only ever one. */
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
 * popover, in the shape of TickTick's.
 *
 * The popovers are rendered inline rather than as the app's existing picker
 * sheets, which each open their own RN Modal — nesting those inside this one is
 * fragile, and a compact menu above the toolbar is what the design calls for
 * anyway.
 */
export default function TaskComposerSheet({ visible, onClose, defaults, contextLabel }: Props) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { state, addTaskFromQuickAdd } = useTasks();
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const [dueTime, setDueTime] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<Priority>('none');
  const [tags, setTags] = useState<string[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [keyboard, setKeyboard] = useState(0);

  // Reseed on every open: the view's scope may have changed since last time, and
  // a half-typed task from a previous open shouldn't reappear.
  useEffect(() => {
    if (!visible) return;
    setText('');
    setDueDate(defaults?.dueDate);
    setDueTime(defaults?.dueTime);
    setPriority(defaults?.priority ?? 'none');
    setTags(defaults?.tags ?? []);
    setListId(defaults?.listId ?? null);
    setMenu(null);
  }, [visible, defaults]);

  // `SlideUpModal` never unmounts its children once opened once, so `autoFocus`
  // — which only fires on a TextInput's initial mount — only ever gets one
  // chance, and it fires while the sheet is still animating in off-screen.
  // Focusing explicitly once the slide-up finishes is what actually raises the
  // keyboard on every open, not just the first.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [visible]);

  // The sheet is bottom-anchored, so it has to ride the keyboard itself —
  // KeyboardAvoidingView is unreliable inside a Modal.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
    onClose();
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
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      sheetStyle={[styles.sheet, { bottom: keyboard, paddingBottom: keyboard > 0 ? 12 : Math.max(16, insets.bottom) }]}
    >
      <TextInput
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

      {/*
       * Rendered last so it paints over the input above it — React Native
       * stacks later siblings on top by default, and an earlier attempt at this
       * had the placeholder text bleeding through the popover despite correct
       * `position: absolute` placement, because it was declared first in JSX.
       */}
      {menu && (
        <>
          {/* Tapping anywhere else in the sheet dismisses the popover, not the sheet. */}
          <Pressable style={styles.menuScrim} onPress={() => setMenu(null)} />
          <View style={styles.menu}>
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
        </>
      )}
    </SlideUpModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
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
  /** Catches taps meant to dismiss the popover before they reach the sheet. */
  menuScrim: {
    position: 'absolute',
    top: -600,
    left: -16,
    right: -16,
    bottom: 0,
    zIndex: 10,
  },
  menu: {
    position: 'absolute',
    left: 12,
    bottom: '100%',
    marginBottom: 8,
    minWidth: 210,
    maxWidth: 300,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    // Belt-and-braces alongside rendering last in JSX: on iOS, sibling paint
    // order alone was not enough to reliably beat the TextInput's placeholder.
    zIndex: 20,
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

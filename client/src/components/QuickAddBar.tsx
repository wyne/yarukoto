import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { useFieldFocus } from '../theme/focus';
import { useHoverBg } from '../theme/hover';
import { priorityColor } from '../theme/colors';
import { QuickAddDefaults, useTasks } from '../data/TaskContext';
import { IconCalendarBox, IconFlag, IconFolder, IconPlus, IconTag } from '../icons/Icons';
import { formatDueShort } from '../data/dateUtils';
import { getListById } from '../data/selectors';
import { applySuggestion, useQuickAddSuggestions } from '../data/quickAddSuggestions';
import { useCommand } from '../navigation/MenuCommands';
import { focusNextPane, focusPane, usePaneFocus } from '../navigation/focusPanes';
import { useNativeDateTimePicker } from '../navigation/DateTimePickerContext';
import KeyCommandsView from '../../modules/mac-pointer/src/KeyCommandsView';
import { MAC } from '../data/platform';
import ShortcutHint from './ShortcutHint';
import QuickAddInput from './QuickAddInput';
import { addFieldKey } from '../data/addFieldKeys';
import { afterLayersClose } from './openLayers';
import Tooltip from './Tooltip';
import HoverPressable from './HoverPressable';
import { measureAnchor, PopoverAnchor } from './Popover';
import DueDateQuickMenu from './pickers/DueDateQuickMenu';
import PriorityPickerSheet from './pickers/PriorityPickerSheet';
import TagPickerSheet from './pickers/TagPickerSheet';
import ListPickerSheet from './pickers/ListPickerSheet';
import { useQuickAddDraft } from './useQuickAddDraft';

const HINT = 'Add a task… try "pay rent fri 6pm #home !high ~admin"';

type Picker = 'priority' | 'tags' | 'list';

interface Props {
  /** What the view contributes: the tools start from these. */
  defaults?: QuickAddDefaults;
  /** Where the task will land — shown in the placeholder on scoped views. */
  contextLabel?: string;
  /** Called with each task added, so the list can show where it landed. */
  onAdded?: (taskId: string | undefined) => void;
}

/**
 * The desktop add field: the quick-add syntax, with the composer's tools beside
 * it for setting the same fields without knowing the syntax — and for clearing
 * what a typed word set while keeping the word.
 */
export default function QuickAddBar({ defaults, contextLabel, onAdded }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const hoverBg = useHoverBg();
  const { focusProps, focusStyle } = useFieldFocus();
  const { state } = useTasks();
  const presentDateTimePicker = useNativeDateTimePicker();
  const draft = useQuickAddDraft();
  const { text, effective, parsed } = draft;
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);
  const dateRef = useRef<View>(null);
  // File ▸ New Task (⌘N) on the Mac: this field is where a new task starts.
  // Once the command menu it may have come from is gone, which on the web
  // pulls focus back to itself until then.
  useCommand('newTask', () => afterLayersClose(() => inputRef.current?.focus()));
  usePaneFocus('add', () => inputRef.current?.focus());

  // The screens build `defaults` inline, so it's compared by value. A draft
  // already under way keeps what it has; an empty one follows the view.
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const defaultsKey = JSON.stringify(defaults ?? {});
  const { reset } = draft;
  useEffect(() => {
    if (!text) reset(defaultsRef.current);
    // Only a change of view reseeds; typing must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsKey, reset]);

  const submit = () => {
    if (!draft.canSubmit) return;
    onAdded?.(draft.commit());
    reset(defaultsRef.current);
  };

  const refocus = () => afterLayersClose(() => inputRef.current?.focus());
  const openPicker = (which: Picker) => (e: { currentTarget: unknown }) => {
    // The popover gives focus back to whatever had it when it opened, on the
    // web; that should be the field, not the button.
    inputRef.current?.focus();
    measureAnchor(e, (at) => {
      setAnchor(at ?? undefined);
      setPicker(which);
    });
  };
  const closePicker = () => {
    setPicker(null);
    refocus();
  };
  // The Mac's menu offers "Pick date" for the native picker; the web's menu
  // has its own calendar.
  const openDatePicker = () => {
    const node = dateRef.current as unknown as {
      measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
    } | null;
    const present = (at?: PopoverAnchor) =>
      presentDateTimePicker({
        anchor: at,
        mode: 'date',
        date: effective.dueDate,
        time: effective.dueTime,
        onChange: draft.changeDue,
        onDismiss: refocus,
      });
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => present({ x, y, width, height }));
    else present();
  };

  // A tool shows what it set only when the text doesn't already say it, or the
  // view's own scope.
  const pickedDate =
    effective.dueDate && !parsed?.dueDate && effective.dueDate !== defaults?.dueDate
      ? formatDueShort(new Date(), effective.dueDate, effective.dueTime)
      : null;
  const pickedList =
    effective.listId && !parsed?.listName && effective.listId !== (defaults?.listId ?? null)
      ? getListById(state.lists, effective.listId)?.name
      : undefined;

  // Shared with the composer sheet's autocomplete, so the two surfaces can't
  // drift into disagreeing about what a trailing `~`/`#`/`!` token offers.
  const suggestions = useQuickAddSuggestions(text, state);

  const chooseSuggestion = (value: string) => {
    draft.changeText(applySuggestion(text, value));
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const moveSelection = (delta: number) => {
    if (suggestions.length === 0) return;
    setSelectedIndex((i) => (i + delta + suggestions.length) % suggestions.length);
  };

  /**
   * The field's own keys, by `keyName`; which does what is `addFieldKey`'s to
   * say. Only an empty field lets ↓ or Tab take the keyboard elsewhere, so
   * ⌘N, type, Return, ↓ is still a whole loop, but a key reached for while
   * typing never lands on the list.
   */
  const handleKey = (name: string): boolean => {
    const action = addFieldKey(name, { text, suggestionCount: suggestions.length, selectedIndex });
    switch (action.kind) {
      case 'complete':
        chooseSuggestion(suggestions[action.index].value);
        return true;
      case 'highlight':
        moveSelection(action.delta);
        return true;
      case 'leave':
        focusNextPane('add', action.delta);
        return true;
      case 'toList':
        if (!focusPane('list')) inputRef.current?.blur();
        return true;
      case 'swallow':
        return true;
      case 'pass':
        return false;
    }
  };

  // The web reports these keys here. The Mac doesn't report arrows to
  // `onKeyPress` at all, and a field there would act on Tab before JS heard it,
  // so it answers through KeyCommandsView below instead.
  const WEB_KEYS: Record<string, string> = { ArrowDown: 'down', ArrowUp: 'up', Escape: 'escape', Tab: 'tab' };
  const handleKeyPress = (e: { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault?: () => void }) => {
    if (MAC) return;
    const key = WEB_KEYS[e.nativeEvent.key];
    if (!key) return;
    const name = e.nativeEvent.shiftKey ? (key === 'tab' ? 'shift+tab' : null) : key;
    if (name && handleKey(name)) e.preventDefault?.();
  };

  const handleSubmit = () => {
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      chooseSuggestion(suggestions[selectedIndex].value);
      return;
    }
    submit();
  };

  const handleChangeText = (next: string) => {
    draft.changeText(next);
    setSelectedIndex(-1);
  };

  /** A tool's face: tinted once it sets something, with the value when the text doesn't say it. */
  const face = (
    Icon: React.ComponentType<{ size?: number; color?: string }>,
    color: string | null,
    value?: string | null
  ) => (
    <>
      <Icon size={16} color={color ?? colors.textTertiary} />
      {!!value && (
        <Text style={[styles.toolValue, { color: color ?? colors.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      )}
    </>
  );

  const tools = (
    <View style={styles.tools}>
      <Tooltip label="Due date" align="center">
        <View ref={dateRef} collapsable={false}>
          <DueDateQuickMenu
            date={effective.dueDate}
            time={effective.dueTime}
            onChange={draft.changeDue}
            onCustomDate={openDatePicker}
            onDone={refocus}
          >
            <View style={styles.tool}>
              {face(IconCalendarBox, effective.dueDate ? accent : null, pickedDate?.toLowerCase())}
            </View>
          </DueDateQuickMenu>
        </View>
      </Tooltip>
      <Tooltip label="Priority" align="center">
        <HoverPressable style={hoverBg(styles.tool)} onPress={openPicker('priority')} accessibilityLabel="Priority">
          {face(IconFlag, effective.priority !== 'none' ? priorityColor(effective.priority, colors) : null)}
        </HoverPressable>
      </Tooltip>
      <Tooltip label="Tags" align="center">
        <HoverPressable style={hoverBg(styles.tool)} onPress={openPicker('tags')} accessibilityLabel="Tags">
          {face(IconTag, effective.tags.length > 0 ? accent : null)}
        </HoverPressable>
      </Tooltip>
      <Tooltip label="List" align="center">
        <HoverPressable style={hoverBg(styles.tool)} onPress={openPicker('list')} accessibilityLabel="List">
          {face(IconFolder, pickedList || parsed?.listName ? accent : null, pickedList)}
        </HoverPressable>
      </Tooltip>
    </View>
  );

  const field = (
    <>
      <Pressable onPress={submit} hitSlop={8}>
        <IconPlus size={16} color={accent} />
      </Pressable>
      <QuickAddInput
        ref={inputRef}
        value={text}
        literal={draft.literal}
        onChangeText={handleChangeText}
        placeholder={contextLabel ? `Add a task to ${contextLabel}…` : HINT}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={handleSubmit}
        onKeyPress={handleKeyPress}
        {...focusProps}
      />
      {text.length > 0 && <View style={[styles.caret, { backgroundColor: accent }]} />}
      {tools}
      <ShortcutHint command="newTask" />
    </>
  );

  return (
    <View style={[styles.wrap, focusStyle]}>
      {/* Not on a phone, which has no keys to answer, nor Android, which has no such view. */}
      {MAC ? (
        <KeyCommandsView
          style={styles.row}
          // ↓ only while it has something to do here; otherwise the field keeps
          // it, to move its caret like any field's.
          keys={[
            'escape',
            'tab',
            'shift+tab',
            ...(suggestions.length > 0 ? ['up', 'down'] : text.trim() === '' ? ['down'] : []),
          ]}
          onKeyCommand={({ nativeEvent }) => handleKey(nativeEvent.key)}
        >
          {field}
        </KeyCommandsView>
      ) : (
        <View style={styles.row}>{field}</View>
      )}
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s, i) => (
            <Pressable
              key={s.value}
              style={[styles.suggestionRow, i === selectedIndex && styles.suggestionRowSelected]}
              onPress={() => chooseSuggestion(s.value)}
            >
              <Text style={styles.suggestionValue}>{s.value}</Text>
              {!!s.hint && <Text style={styles.suggestionHint}>{s.hint}</Text>}
              {/* The row Tab will take: the highlighted one, else the first. */}
              {i === Math.max(selectedIndex, 0) && <Text style={styles.suggestionTab}>⇥</Text>}
            </Pressable>
          ))}
        </View>
      )}
      <PriorityPickerSheet
        visible={picker === 'priority'}
        onClose={closePicker}
        anchor={anchor}
        onApply={draft.choosePriority}
      />
      <TagPickerSheet
        visible={picker === 'tags'}
        onClose={closePicker}
        anchor={anchor}
        initialTags={effective.tags}
        onApply={draft.applyTags}
      />
      <ListPickerSheet
        visible={picker === 'list'}
        onClose={closePicker}
        anchor={anchor}
        value={effective.listId}
        onApply={draft.chooseList}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
    padding: 0,
  },
  caret: {
    width: 2,
    height: 16,
    borderRadius: 1,
  },
  suggestions: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.divider,
    paddingTop: 6,
    gap: 2,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  suggestionRowSelected: {
    backgroundColor: c.accentTintBg,
  },
  suggestionValue: {
    fontFamily: fonts.monoRegular,
    fontSize: 14.5,
    color: c.textPrimary,
  },
  suggestionHint: {
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.textFaint,
  },
  suggestionTab: {
    marginLeft: 'auto',
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.textFaint,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 5,
    borderRadius: 6,
    justifyContent: 'center',
  },
  toolValue: {
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
    maxWidth: 140,
  },
}));

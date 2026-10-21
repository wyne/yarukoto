import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { useFieldFocus } from '../theme/focus';
import { useTasks } from '../data/TaskContext';
import { IconPlus } from '../icons/Icons';
import { parseQuickAdd, QuickAddRange, QuickAddSpan, quickAddSpans, shiftLiteralRanges } from '../data/quickAdd';
import { formatDueShort } from '../data/dateUtils';
import { applySuggestion, useQuickAddSuggestions } from '../data/quickAddSuggestions';
import { useCommand } from '../navigation/MenuCommands';
import { focusNextPane, focusPane, usePaneFocus } from '../navigation/focusPanes';
import KeyCommandsView from '../../modules/mac-pointer/src/KeyCommandsView';
import { MAC } from '../data/platform';
import ShortcutHint from './ShortcutHint';
import QuickAddInput from './QuickAddInput';
import { addFieldKey } from '../data/addFieldKeys';
import { activeLists } from '../data/selectors';
import { afterLayersClose } from './openLayers';
import Tooltip from './Tooltip';
import HoverPressable from './HoverPressable';
import { priorityColor } from '../theme/colors';
import { hoverable } from '../theme/hover';

const HINT = 'Add a task… try "pay rent fri 6pm #home !high ~admin"';

const WHEN_KINDS = new Set<QuickAddSpan['kind']>(['date', 'time', 'repeat']);

interface Props {
  /** `literal` is the runs of `text` to keep as title text — see the chips below the field. */
  onSubmit: (text: string, literal: QuickAddRange[]) => void;
  /** Where the task will land — shown in the placeholder on scoped views. */
  contextLabel?: string;
}

export default function QuickAddBar({ onSubmit, contextLabel }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const { focusProps, focusStyle } = useFieldFocus();
  const { state } = useTasks();
  const [text, setText] = useState('');
  // Typed words dismissed from the chips: still in the title, no longer tokens.
  const [literal, setLiteral] = useState<QuickAddRange[]>([]);
  const textRef = useRef('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<TextInput>(null);
  // File ▸ New Task (⌘N) on the Mac: this field is where a new task starts.
  // Once the command menu it may have come from is gone, which on the web
  // pulls focus back to itself until then.
  useCommand('newTask', () => afterLayersClose(() => inputRef.current?.focus()));
  usePaneFocus('add', () => inputRef.current?.focus());
  const parsed = text.trim() ? parseQuickAdd(text, new Date(), literal) : null;
  const dueLabel = parsed ? formatDueShort(new Date(), parsed.dueDate, parsed.dueTime) : null;
  const typedList = parsed?.listName
    ? activeLists(state.lists).find((l) => l.name.toLowerCase() === parsed.listName!.toLowerCase())
    : undefined;

  /** Every edit to the field, so the kept words move with the text around them. */
  const changeText = (next: string) => {
    const prev = textRef.current;
    textRef.current = next;
    setText(next);
    setLiteral((ranges) => shiftLiteralRanges(prev, next, ranges));
  };

  /**
   * A chip under the field is what its typed words set; clicking it keeps
   * those words as title text instead. There are no tools here to clear a
   * field with, and a word like "today" is sometimes just part of the title.
   */
  const keepAsText = (match: (span: QuickAddSpan, word: string) => boolean) => {
    const hits = quickAddSpans(text, new Date(), literal).filter((s) => match(s, text.slice(s.start, s.end)));
    setLiteral((ranges) => [...ranges, ...hits.map(({ start, end }) => ({ start, end }))]);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text, literal);
    changeText('');
  };

  // Shared with the composer sheet's autocomplete, so the two surfaces can't
  // drift into disagreeing about what a trailing `~`/`#`/`!` token offers.
  const suggestions = useQuickAddSuggestions(text, state);

  const chooseSuggestion = (value: string) => {
    changeText(applySuggestion(text, value));
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
    changeText(next);
    setSelectedIndex(-1);
  };

  const chips: { key: string; label: string; color: string; bg: string; dismiss: () => void }[] = [];
  if (parsed) {
    if (dueLabel)
      chips.push({
        key: 'when',
        label: dueLabel.toLowerCase(),
        color: accent,
        bg: colors.accentTintBg,
        dismiss: () => keepAsText((s) => WHEN_KINDS.has(s.kind)),
      });
    if (parsed.listName)
      chips.push({
        key: 'list',
        label: typedList?.name ?? `~${parsed.listName}`,
        color: colors.textSecondary,
        bg: colors.chipBg,
        dismiss: () => keepAsText((s) => s.kind === 'list'),
      });
    for (const tag of parsed.tags)
      chips.push({
        key: `#${tag}`,
        label: `#${tag}`,
        color: colors.textSecondary,
        bg: colors.chipBg,
        dismiss: () => keepAsText((s, word) => s.kind === 'tag' && word.slice(1).toLowerCase() === tag),
      });
    if (parsed.priority !== 'none')
      chips.push({
        key: 'priority',
        label: `!${parsed.priority}`,
        color: priorityColor(parsed.priority, colors),
        bg: colors.chipBg,
        dismiss: () => keepAsText((s) => s.kind === 'priority'),
      });
  }

  const field = (
    <>
      <Pressable onPress={submit} hitSlop={8}>
        <IconPlus size={16} color={accent} />
      </Pressable>
      <QuickAddInput
        ref={inputRef}
        value={text}
        literal={literal}
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
      {chips.length > 0 && (
        <View style={styles.chipsRow}>
          {chips.map((c) => (
            <Tooltip key={c.key} label="Keep as text" align="start">
              <HoverPressable
                onPress={c.dismiss}
                accessibilityRole="button"
                accessibilityLabel={`Keep ${c.label} as text`}
                style={hoverable([styles.chip, { backgroundColor: c.bg }], styles.chipHovered)}
              >
                <Text style={[styles.chipText, { color: c.color }]}>{c.label}</Text>
                <Text style={[styles.chipX, { color: c.color }]}>×</Text>
              </HoverPressable>
            </Tooltip>
          ))}
        </View>
      )}
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
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingLeft: 26,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  chipHovered: {
    opacity: 0.75,
  },
  chipX: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    opacity: 0.7,
  },
  chipText: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
  },
}));

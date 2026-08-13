import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import { IconPlus } from '../icons/Icons';
import { parseQuickAdd } from '../data/quickAdd';
import { formatDueShort } from '../data/dateUtils';
import { activeFolders, activeLists } from '../data/selectors';

const HINT = 'Add a task… try "pay rent fri 6pm #home !high ~admin"';

const PRIORITIES = ['high', 'medium', 'low', 'none'];

interface Suggestion {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  onSubmit: (text: string) => void;
  /** Where the task will land — shown in the placeholder on scoped views. */
  contextLabel?: string;
}

export default function QuickAddBar({ onSubmit, contextLabel }: Props) {
  const accent = useAccent();
  const { state } = useTasks();
  const [text, setText] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<TextInput>(null);
  const parsed = text.trim() ? parseQuickAdd(text) : null;
  const dueLabel = parsed ? formatDueShort(new Date(), parsed.dueDate, parsed.dueTime) : null;

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text);
    setText('');
  };

  const tags = useMemo(
    () => Array.from(new Set(state.tasks.flatMap((t) => t.tags))).sort((a, b) => a.localeCompare(b)),
    [state.tasks]
  );
  const folderName = useMemo(
    () => new Map(activeFolders(state.folders).map((f) => [f.id, f.name])),
    [state.folders]
  );
  const listSuggestions = useMemo(
    () =>
      activeLists(state.lists).map((l) => ({
        label: l.name,
        hint: folderName.get(l.folderId),
      })),
    [state.lists, folderName]
  );

  const trailing = text.match(/(^|\s)([~#!])(\S*)$/);
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trailing) return [];
    const prefix = trailing[2];
    const q = trailing[3].toLowerCase();
    if (prefix === '~') {
      return listSuggestions
        .filter((s) => s.label.toLowerCase().includes(q) || (s.hint ?? '').toLowerCase().includes(q))
        .slice(0, 6)
        .map((s) => ({ value: `~${s.label}`, label: s.label, hint: s.hint }));
    }
    if (prefix === '#') {
      return tags
        .filter((t) => t.toLowerCase().includes(q))
        .slice(0, 6)
        .map((t) => ({ value: `#${t}`, label: t, hint: 'tag' }));
    }
    return PRIORITIES.filter((p) => p.toLowerCase().includes(q)).map((p) => ({
      value: `!${p}`,
      label: p,
      hint: p === 'none' ? 'clear' : 'priority',
    }));
  }, [trailing, listSuggestions, tags]);

  const applySuggestion = (value: string) => {
    const m = text.match(/(^|\s)([~#!])(\S*)$/);
    if (!m) return;
    const start = text.lastIndexOf(m[1]) + m[1].length;
    setText(text.slice(0, start) + value + ' ');
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const moveSelection = (delta: number) => {
    if (suggestions.length === 0) return;
    setSelectedIndex((i) => (i + delta + suggestions.length) % suggestions.length);
  };

  const handleKeyPress = (e: { nativeEvent: { key: string }; preventDefault?: () => void }) => {
    if (suggestions.length === 0) return;
    if (e.nativeEvent.key === 'ArrowDown') {
      moveSelection(1);
      e.preventDefault?.();
    } else if (e.nativeEvent.key === 'ArrowUp') {
      moveSelection(-1);
      e.preventDefault?.();
    }
  };

  const handleSubmit = () => {
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      applySuggestion(suggestions[selectedIndex].value);
      return;
    }
    submit();
  };

  const handleChangeText = (next: string) => {
    setText(next);
    setSelectedIndex(-1);
  };

  const hasChips = !!(dueLabel || parsed?.tags.length || parsed?.listName || (parsed && parsed.priority !== 'none'));

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable onPress={submit} hitSlop={8}>
          <IconPlus size={16} color={accent} />
        </Pressable>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={handleChangeText}
          placeholder={contextLabel ? `Add a task to ${contextLabel}…` : HINT}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={handleSubmit}
          onKeyPress={handleKeyPress}
        />
        {text.length > 0 && <View style={[styles.caret, { backgroundColor: accent }]} />}
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s, i) => (
            <Pressable
              key={s.value}
              style={[styles.suggestionRow, i === selectedIndex && styles.suggestionRowSelected]}
              onPress={() => applySuggestion(s.value)}
            >
              <Text style={styles.suggestionValue}>{s.value}</Text>
              {!!s.hint && <Text style={styles.suggestionHint}>{s.hint}</Text>}
            </Pressable>
          ))}
        </View>
      )}
      {hasChips && (
        <View style={styles.chipsRow}>
          {dueLabel && (
            <View style={[styles.chip, { backgroundColor: colors.accentTintBg }]}>
              <Text style={[styles.chipText, { color: accent }]}>{dueLabel.toLowerCase()}</Text>
            </View>
          )}
          {parsed?.tags.map((t) => (
            <View key={t} style={[styles.chip, { backgroundColor: colors.chipBg }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]}>#{t}</Text>
            </View>
          ))}
          {parsed?.listName && (
            <View style={[styles.chip, { backgroundColor: colors.chipBg }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]}>~{parsed.listName}</Text>
            </View>
          )}
          {parsed && parsed.priority !== 'none' && (
            <View style={[styles.chip, { backgroundColor: colors.priorityHighBg }]}>
              <Text style={[styles.chipText, { color: colors.priorityHigh }]}>!{parsed.priority}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    fontSize: 14,
    color: colors.textPrimary,
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
    borderTopColor: colors.divider,
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
    backgroundColor: colors.accentTintBg,
  },
  suggestionValue: {
    fontFamily: fonts.monoRegular,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  suggestionHint: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    color: colors.textFaint,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingLeft: 26,
  },
  chip: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  chipText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
  },
});

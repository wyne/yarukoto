import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import { IconPlus } from '../icons/Icons';
import { parseQuickAdd } from '../data/quickAdd';
import { formatDueShort } from '../data/dateUtils';
import { applySuggestion, useQuickAddSuggestions } from '../data/quickAddSuggestions';

const HINT = 'Add a task… try "pay rent fri 6pm #home !high ~admin"';

interface Props {
  onSubmit: (text: string) => void;
  /** Where the task will land — shown in the placeholder on scoped views. */
  contextLabel?: string;
}

export default function QuickAddBar({ onSubmit, contextLabel }: Props) {
  const colors = useColors();
  const styles = useStyles();
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

  // Shared with the composer sheet's autocomplete, so the two surfaces can't
  // drift into disagreeing about what a trailing `~`/`#`/`!` token offers.
  const suggestions = useQuickAddSuggestions(text, state);

  const chooseSuggestion = (value: string) => {
    setText(applySuggestion(text, value));
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
      chooseSuggestion(suggestions[selectedIndex].value);
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
              onPress={() => chooseSuggestion(s.value)}
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
    fontSize: 13,
  },
}));

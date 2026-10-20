import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Pressable from './HoverPressable';
import Dialog from './Dialog';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { useFieldFocus } from '../theme/focus';
import { MAC, MAC_KEYS } from '../data/platform';
import { LINKS, openLink } from '../data/links';
import { filterShortcutSections, shortcutSearchTerms } from '../data/shortcutSearch';
import { COMMANDS, CommandDef, CommandId, Shortcut, formatShortcut, paletteTitle } from '../navigation/commands';

interface Row {
  title: string;
  keys: string;
  searchTerms?: string;
}

/** The views, which are seven commands but one row: ⌘1 to ⌘7. */
const VIEW_IDS = new Set<CommandId>(['goAll', 'goInbox', 'goToday', 'goCalendar', 'goActivity', 'goBrowse', 'goTrash']);
/** Answered by the notes editor, not the list or the window. */
const EDITING_IDS = new Set<CommandId>(['bold', 'italic']);

/** The keys this build answers for a command: the menu's, where it has it, then the list's. */
function keysFor(def: CommandDef, mac: boolean): string | null {
  const shortcuts: Shortcut[] = [];
  // The web only answers the shortcuts a browser lets a page have.
  if (def.shortcut && (MAC || def.web)) shortcuts.push(def.shortcut);
  shortcuts.push(...(def.listKeys ?? []));
  if (shortcuts.length === 0) return null;
  return shortcuts.map((k) => formatShortcut(k, mac)).join(MAC_KEYS ? '  ' : ', ');
}

/**
 * Every key, in one place — Help ▸ Keyboard Shortcuts, or ⌘/.
 *
 * Built from the command list, as the menu bar and ⌘K are, so it can't teach a
 * key the app doesn't have. The few keys that belong to fields rather than to
 * commands — Tab and Escape between panes — are spelled out here, as they are
 * on the docs page this links to. Search narrows this complete, read-only
 * reference; unlike ⌘K, it does not depend on what the current screen can do.
 */
function sections(): { title: string; rows: Row[] }[] {
  const fmt = (input: string, ...modifiers: Shortcut['modifiers']) => formatShortcut({ input, modifiers }, MAC_KEYS);
  const terms = (input: string, ...modifiers: Shortcut['modifiers']) => shortcutSearchTerms([{ input, modifiers }]);
  const window: Row[] = [
    { title: 'Next pane or field', keys: fmt('tab'), searchTerms: terms('tab') },
    { title: 'Previous pane or field', keys: fmt('tab', 'shift'), searchTerms: terms('tab', 'shift') },
    { title: 'Leave a field for the list', keys: fmt('escape'), searchTerms: terms('escape') },
  ];
  const list: Row[] = [];
  const editing: Row[] = [
    { title: 'Title to notes', keys: fmt('return'), searchTerms: terms('return') },
  ];
  if (MAC) {
    const viewShortcuts = Array.from({ length: 7 }, (_, i): Shortcut => ({
      input: String(i + 1),
      modifiers: ['command'],
    }));
    window.push({
      title: 'All, Inbox, Today, Calendar, Activity, Browse, Trash',
      keys: `${fmt('1', 'command')} – ${fmt('7', 'command')}`,
      searchTerms: shortcutSearchTerms(viewShortcuts),
    });
  }
  for (const def of COMMANDS) {
    if (VIEW_IDS.has(def.id)) continue;
    const keys = keysFor(def, MAC_KEYS);
    if (!keys) continue;
    const shortcuts = [
      ...(def.shortcut && (MAC || def.web) ? [def.shortcut] : []),
      ...(def.listKeys ?? []),
    ];
    const row = {
      title: def.hiddenFromPalette ? def.title : paletteTitle(def),
      keys,
      searchTerms: `${def.keywords ?? ''} ${shortcutSearchTerms(shortcuts)}`,
    };
    if (EDITING_IDS.has(def.id)) editing.push(row);
    else if (def.list) list.push(row);
    else window.push(row);
  }
  return [
    { title: 'Window', rows: window },
    { title: 'Task list', rows: list },
    { title: 'Editing a task', rows: editing },
  ];
}

export default function KeyboardShortcuts({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const accent = useAccent();
  const colors = useColors();
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { focusProps, focusStyle } = useFieldFocus();
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const filtered = useMemo(() => filterShortcutSections(sections(), query), [query]);
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      onShow={() => inputRef.current?.focus()}
      width={560}
      header={(
        <View style={styles.header}>
          <Text style={styles.heading}>Keyboard Shortcuts</Text>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search shortcuts…"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Search keyboard shortcuts"
            style={[styles.input, focusStyle && { borderBottomColor: focusStyle.borderColor }]}
            {...focusProps}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      )}
    >
      {filtered.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.rows.map((row) => (
            <View key={row.title} style={styles.row}>
              <Text style={styles.title} numberOfLines={1}>
                {row.title}
              </Text>
              <Text style={styles.keys}>{row.keys}</Text>
            </View>
          ))}
        </View>
      ))}
      {filtered.length === 0 && <Text style={styles.empty}>No shortcuts match.</Text>}
      <Pressable onPress={() => openLink(LINKS.keyboard)} style={styles.more} accessibilityRole="link">
        <Text style={[styles.moreText, { color: accent }]}>All shortcuts, explained</Text>
      </Pressable>
    </Dialog>
  );
}

const useStyles = makeStyles((c) => ({
  header: {
    paddingHorizontal: 16,
  },
  heading: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    color: c.textPrimary,
  },
  input: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textPrimary,
  },
  keys: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: c.textTertiary,
    letterSpacing: 1,
  },
  more: {
    marginTop: 16,
    paddingVertical: 6,
  },
  moreText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  empty: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textTertiary,
    paddingVertical: 16,
  },
}));

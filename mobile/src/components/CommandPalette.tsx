import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, Text, TextInput, View } from 'react-native';
import Pressable from './HoverPressable';
import Dialog from './Dialog';
import KeyCommandsView from '../../modules/mac-pointer/src/KeyCommandsView';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useColors } from '../theme/ThemeContext';
import { useTasks } from '../data/TaskContext';
import { activeFolders, activeLists, tagCounts } from '../data/selectors';
import { MAC } from '../data/platform';
import { rankPaletteItems } from '../data/paletteSearch';
import { COMMANDS, CommandId, formatShortcut, paletteTitle } from '../navigation/commands';
import { dispatchCommand, useAvailableCommands } from '../navigation/MenuCommands';
import { navigationRef } from '../navigation/DateTimePickerContext';
import { tabNavigation } from '../navigation/destinations';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface Entry {
  key: string;
  title: string;
  keywords?: string;
  /** Right-aligned: a command's shortcut, or what kind of place a destination is. */
  detail?: string;
  /** The shortcut is drawn in key glyphs; a kind in the caption face. */
  detailIsShortcut?: boolean;
  run: () => void;
}

/** The fixed views, in the nav's order. */
const VIEWS: { route: string; title: string; keywords?: string }[] = [
  { route: 'InboxTab', title: 'Inbox' },
  { route: 'TodayTab', title: 'Today' },
  { route: 'AllTab', title: 'All' },
  { route: 'CalendarTab', title: 'Calendar' },
  { route: 'BrowseTab', title: 'Browse', keywords: 'search find' },
  { route: 'ActivityTab', title: 'Activity', keywords: 'history log' },
  { route: 'TrashTab', title: 'Trash', keywords: 'deleted bin' },
];

/** Seen in this many rows at once; the rest scroll. */
const MAX_ROWS = 9;
const ROW_HEIGHT = 38;

/** Where a key is drawn as a glyph (⌘K) rather than a name (Ctrl+K). */
const MAC_KEYS =
  MAC ||
  (Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? ''));

function goTo(route: string, params?: object) {
  const [name, next] = tabNavigation(route, params);
  (navigationRef.navigate as (name: string, params?: object) => void)('Main', { screen: name, params: next });
}

/**
 * The command menu: ⌘K, then type to go anywhere or do anything.
 *
 * One search over the places in the nav — views, lists, folders, tags, saved
 * filters — and every command something on screen can answer right now, each
 * with its shortcut beside it. That last part is half the point: choosing a
 * command here is how its key gets learned.
 *
 * The commands come from the same list the menu bar is built from
 * (`commands.ts`), and only the ones with a handler registered are listed, so
 * nothing here is greyed out or does nothing when chosen.
 */
export default function CommandPalette({ visible, onClose }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const { state, supportsFeature } = useTasks();
  const available = useAvailableCommands();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<ScrollView>(null);

  // A fresh search each time it opens, as every command menu does.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setIndex(0);
  }, [visible]);

  const entries = useMemo<Entry[]>(() => {
    if (!visible) return [];
    const out: Entry[] = [];

    // What acts on the tasks in front comes first: with nothing typed, that is
    // what the menu is most likely open for.
    const commands = [...COMMANDS.filter((c) => c.list), ...COMMANDS.filter((c) => !c.list)];
    for (const def of commands) {
      if (def.hiddenFromPalette || !available.has(def.id)) continue;
      // Only a key that works here is worth teaching: the web leaves some to
      // the browser.
      const shortcut = def.shortcut && (MAC || def.web) ? def.shortcut : undefined;
      out.push({
        key: `c:${def.id}`,
        title: paletteTitle(def),
        keywords: def.keywords,
        detail: shortcut ? formatShortcut(shortcut, MAC_KEYS) : undefined,
        detailIsShortcut: true,
        run: () => dispatchCommand(def.id as CommandId),
      });
    }

    for (const view of VIEWS) {
      out.push({ key: `v:${view.route}`, title: view.title, keywords: view.keywords, detail: 'View', run: () => goTo(view.route) });
    }
    for (const list of activeLists(state.lists)) {
      out.push({ key: `l:${list.id}`, title: list.name, detail: 'List', run: () => goTo('InboxTab', { listId: list.id }) });
    }
    for (const folder of activeFolders(state.folders)) {
      out.push({ key: `f:${folder.id}`, title: folder.name, detail: 'Folder', run: () => goTo('InboxTab', { folderId: folder.id }) });
    }
    for (const { tag } of tagCounts(state.tasks)) {
      out.push({ key: `t:${tag}`, title: `#${tag}`, keywords: tag, detail: 'Tag', run: () => goTo('InboxTab', { tag }) });
    }
    if (supportsFeature('savedFilters')) {
      for (const filter of state.savedFilters) {
        if (filter.deletedAt) continue;
        out.push({
          key: `s:${filter.id}`,
          title: filter.name,
          detail: 'Filter',
          run: () => goTo('BrowseTab', { savedFilterId: filter.id, at: Date.now() }),
        });
      }
    }
    return out;
  }, [visible, available, state.lists, state.folders, state.tasks, state.savedFilters, supportsFeature]);

  const results = useMemo(() => rankPaletteItems(entries, query), [entries, query]);
  const selected = Math.min(index, Math.max(0, results.length - 1));

  // Keep the chosen row in sight as the arrows walk past the edge.
  useEffect(() => {
    const top = selected * ROW_HEIGHT;
    listRef.current?.scrollTo({ y: Math.max(0, top - ROW_HEIGHT * (MAX_ROWS - 1)), animated: false });
  }, [selected]);

  /**
   * Closes, then runs. A command acting on the list, or focusing a field, has to
   * land on the window with this dialog gone: on the Mac a list command is
   * refused while anything is presented over the list, and a field can't take
   * focus from under a dialog.
   */
  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    setTimeout(entry.run, Platform.OS === 'web' ? 0 : 250);
  };

  const move = (delta: number) => {
    if (results.length === 0) return;
    setIndex((selected + delta + results.length) % results.length);
  };

  const field = (
    <TextInput
      ref={inputRef}
      value={query}
      onChangeText={(text) => {
        setQuery(text);
        setIndex(0);
      }}
      placeholder="Go to or do…"
      placeholderTextColor={colors.textFaint}
      style={styles.input}
      autoFocus
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="go"
      blurOnSubmit={false}
      onSubmitEditing={() => choose(results[selected])}
      // The web reports arrows here; the Mac doesn't, so KeyCommandsView below.
      onKeyPress={(e) => {
        const key = e.nativeEvent.key;
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          move(key === 'ArrowDown' ? 1 : -1);
          (e as unknown as { preventDefault?: () => void }).preventDefault?.();
        }
      }}
    />
  );

  return (
    <Dialog visible={visible} onClose={onClose} onShow={() => inputRef.current?.focus()} width={520}>
      {MAC ? (
        <KeyCommandsView
          keys={['up', 'down']}
          onKeyCommand={({ nativeEvent }) => move(nativeEvent.key === 'down' ? 1 : -1)}
        >
          {field}
        </KeyCommandsView>
      ) : (
        field
      )}
      <ScrollView
        ref={listRef}
        style={{ maxHeight: ROW_HEIGHT * MAX_ROWS }}
        keyboardShouldPersistTaps="always"
      >
        {results.length === 0 && <Text style={styles.empty}>Nothing matches.</Text>}
        {results.map((entry, i) => (
          <Pressable
            key={entry.key}
            onPress={() => choose(entry)}
            // The web reports hover as hover; the Mac as a pointer entering.
            onHoverIn={() => setIndex(i)}
            onPointerEnter={() => setIndex(i)}
            style={[styles.row, i === selected && styles.rowSelected]}
          >
            <Text style={styles.title} numberOfLines={1}>
              {entry.title}
            </Text>
            {!!entry.detail && (
              <Text style={entry.detailIsShortcut ? styles.shortcut : styles.kind}>{entry.detail}</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </Dialog>
  );
}

const useStyles = makeStyles((c) => ({
  input: {
    fontFamily: fonts.sansRegular,
    fontSize: 17,
    color: c.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    borderRadius: 7,
  },
  rowSelected: {
    backgroundColor: c.selectedRowBg,
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
  },
  shortcut: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: c.textTertiary,
    letterSpacing: 1,
  },
  kind: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  empty: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textTertiary,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
}));

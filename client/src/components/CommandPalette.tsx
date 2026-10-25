import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, PointerEvent, ScrollView, Text, TextInput, View } from 'react-native';
import Pressable from './HoverPressable';
import Dialog from './Dialog';
import KeyCommandsView from '../../modules/mac-pointer/src/KeyCommandsView';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors, useTextScale } from '../theme/ThemeContext';
import { useFieldFocus } from '../theme/focus';
import { useTasks } from '../data/TaskContext';
import { activeFolders, activeLists, tagCounts } from '../data/selectors';
import {
  PICKER_TITLE,
  PalettePicker,
  listIdFor,
  listPickerItems,
  tagPickerItems,
  taskPickerItems,
  toggleTag,
} from '../data/palettePickers';
import { MAC, MAC_KEYS } from '../data/platform';
import { LINKS, openLink } from '../data/links';
import { filterShortcutSections } from '../data/shortcutSearch';
import { shortcutSections } from '../data/shortcutReference';
import { rankPaletteItems } from '../data/paletteSearch';
import { COMMANDS, CommandId, displayShortcut, formatShortcut, paletteTitle } from '../navigation/commands';
import { dispatchCommand, useAvailableCommands, useCheckedCommands } from '../navigation/MenuCommands';
import { goTo, useShowTask } from '../navigation/showTask';

interface Props {
  visible: boolean;
  onClose: () => void;
  /**
   * A picker in place of the search: Move to List… and Edit Tags… for these
   * tasks, Go to Task…, or the Keyboard Shortcuts reference.
   */
  picker?: PalettePicker | null;
  /** Escape from a picker: back to the search it came from, or closed if it came by its key. */
  onLeavePicker?: () => void;
}

interface Entry {
  key: string;
  /** The primary search text, so "today" finds the view before Set Due Date: Today. */
  title: string;
  /** Drawn before the title and searched after it: "Go to" or "Set". */
  prefix?: string;
  keywords?: string;
  /** A picker's current value, drawn with a check. */
  checked?: boolean;
  /** Runs with the menu still up: a picker opening in it, or a tag toggled. */
  keepOpen?: boolean;
  /** Right-aligned: a command's shortcut, or what kind of place a destination is. */
  detail?: string;
  /** The shortcut is drawn in key glyphs; a kind in the caption face. */
  detailIsShortcut?: boolean;
  run: () => void;
}

/** The fixed views, in the nav's order. */
const VIEWS: { route: string; title: string; keywords?: string }[] = [
  { route: 'InboxTab', title: 'Inbox' },
  { route: 'TodayTab', title: 'Agenda', keywords: 'today upcoming' },
  { route: 'AllTab', title: 'All' },
  { route: 'CalendarTab', title: 'Plan', keywords: 'calendar schedule' },
  { route: 'BrowseTab', title: 'Browse', keywords: 'search find' },
  { route: 'ActivityTab', title: 'Activity', keywords: 'history log' },
  { route: 'TrashTab', title: 'Trash', keywords: 'deleted bin' },
];

/**
 * Before every place, so a list or a tag reads as somewhere to go rather than
 * something to set on a task. Setting one is Move to List… and Edit Tags….
 */
const GO_TO = 'Go to';

const PICKER_PLACEHOLDER: Record<PalettePicker['kind'], string> = {
  moveToList: 'Move to…',
  editTags: 'Add or remove a tag…',
  goToTask: 'Find a task by name…',
  keyboardShortcuts: 'Search shortcuts…',
};

/** Named like the others, so each of ⌘K, ⌘O and ⌘/ says which one is up. */
const SEARCH_TITLE = 'Command Menu';

/** Seen in this many rows at once; the rest scroll. */
const MAX_ROWS = 9;
/** At the default text size; it grows with View › Bigger Text. */
const ROW_HEIGHT = 38;
/** Drawn at most: Go to Task… can match thousands, and nobody scrolls past this many. */
const MAX_RESULTS = 100;

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
 *
 * Every picker shows in this one dialog, the keyboard reference among them, so
 * any of their keys pressed while another is up replaces what it shows. Two
 * dialogs stacked over the window would each claim the keyboard, and the one
 * underneath could be left holding it after the other closed.
 */
export default function CommandPalette({ visible, onClose, picker = null, onLeavePicker = onClose }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const accent = useAccent();
  const reference = picker?.kind === 'keyboardShortcuts';
  const { state, supportsFeature, bulkUpdate, updateTask } = useTasks();
  const showTask = useShowTask();
  const available = useAvailableCommands();
  const checked = useCheckedCommands();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const { focusProps, focusStyle } = useFieldFocus();
  const listRef = useRef<ScrollView>(null);

  // A fresh search each time it opens, as every command menu does, and each
  // time a picker takes over from the search or hands back to it.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setIndex(0);
    scrollY.current = 0;
    pointerAt.current = null;
    listRef.current?.scrollTo({ y: 0, animated: false });
  }, [visible, picker]);

  const pickerEntries = useMemo<Entry[] | null>(() => {
    if (!visible || !picker) return null;
    // Read, not chosen from: drawn in its sections below.
    if (picker.kind === 'keyboardShortcuts') return [];
    if (picker.kind === 'goToTask') {
      return taskPickerItems(state.tasks, state.lists).map((item) => ({
        ...item,
        run: () => showTask(item.key),
      }));
    }
    const ids = picker.taskIds;
    if (picker.kind === 'moveToList') {
      return listPickerItems(state.lists, state.folders, state.tasks, ids).map((item) => ({
        ...item,
        run: () => bulkUpdate(ids, { listId: listIdFor(item.key) }),
      }));
    }
    return tagPickerItems(state.tasks, ids, query).map((item) => ({
      ...item,
      // Toggling one tag is rarely all: the picker stays for the next.
      keepOpen: true,
      run: () => {
        toggleTag(state.tasks, ids, item.key).forEach(({ id, tags }) => updateTask(id, { tags }));
        setQuery('');
      },
    }));
  }, [visible, picker, query, state.lists, state.folders, state.tasks, bulkUpdate, updateTask, showTask]);

  const entries = useMemo<Entry[]>(() => {
    if (!visible || picker) return [];
    const out: Entry[] = [];

    // What acts on the tasks in front comes first: with nothing typed, that is
    // what the menu is most likely open for.
    const commands = [...COMMANDS.filter((c) => c.list), ...COMMANDS.filter((c) => !c.list)];
    for (const def of commands) {
      // The option already in use is no choice: Group By: List while grouped by list.
      if (def.hiddenFromPalette || !available.has(def.id) || checked.has(def.id)) continue;
      // Only a key that works here is worth teaching: the web leaves some to
      // the browser.
      const shortcut = displayShortcut(def, !MAC);
      out.push({
        key: `c:${def.id}`,
        title: paletteTitle(def),
        prefix: def.palettePrefix,
        keywords: def.keywords,
        detail: shortcut ? formatShortcut(shortcut, MAC_KEYS) : undefined,
        detailIsShortcut: true,
        keepOpen: def.picker,
        run: () => dispatchCommand(def.id as CommandId, true),
      });
    }

    // Each place answers to its kind as well as its name, so "tag" lists the
    // tags and "tag work" narrows to #work, as the kind beside it suggests.
    for (const view of VIEWS) {
      out.push({
        key: `v:${view.route}`,
        title: view.title,
        prefix: GO_TO,
        keywords: `go view ${view.keywords ?? ''}`,
        detail: 'View',
        run: () => goTo(view.route),
      });
    }
    for (const list of activeLists(state.lists)) {
      out.push({
        key: `l:${list.id}`,
        title: list.name,
        prefix: GO_TO,
        keywords: 'go list',
        detail: 'List',
        run: () => goTo('InboxTab', { listId: list.id }),
      });
    }
    for (const folder of activeFolders(state.folders)) {
      out.push({
        key: `f:${folder.id}`,
        title: folder.name,
        prefix: GO_TO,
        keywords: 'go folder',
        detail: 'Folder',
        run: () => goTo('InboxTab', { folderId: folder.id }),
      });
    }
    for (const { tag } of tagCounts(state.tasks)) {
      out.push({
        key: `t:${tag}`,
        title: `#${tag}`,
        prefix: GO_TO,
        keywords: `go tag ${tag}`,
        detail: 'Tag',
        run: () => goTo('InboxTab', { tag }),
      });
    }
    if (supportsFeature('savedFilters')) {
      for (const filter of state.savedFilters) {
        if (filter.deletedAt) continue;
        out.push({
          key: `s:${filter.id}`,
          title: filter.name,
          prefix: GO_TO,
          keywords: 'go filter saved',
          detail: 'Filter',
          run: () => goTo('BrowseTab', { savedFilterId: filter.id, at: Date.now() }),
        });
      }
    }
    return out;
  }, [visible, picker, available, checked, state.lists, state.folders, state.tasks, state.savedFilters, supportsFeature]);

  const results = useMemo(
    () => rankPaletteItems(pickerEntries ?? entries, query).slice(0, MAX_RESULTS),
    [pickerEntries, entries, query]
  );
  const selected = Math.min(index, Math.max(0, results.length - 1));
  const shortcuts = useMemo(
    () => (visible && reference ? filterShortcutSections(shortcutSections(), query) : []),
    [visible, reference, query]
  );

  /**
   * Where the list is scrolled to, as it last reported. Tracked rather than
   * asked for, because the arrows need it to scroll only as far as the next row
   * — and only the arrows scroll: a row chosen by the pointer is already in
   * sight, and pulling the list to it would fight the wheel that brought it.
   */
  const scrollY = useRef(0);
  const rowHeight = Math.round(ROW_HEIGHT * useTextScale());
  const reveal = (i: number) => {
    const top = i * rowHeight;
    const viewport = rowHeight * MAX_ROWS;
    let y = scrollY.current;
    if (top < y) y = top;
    else if (top + rowHeight > y + viewport) y = top + rowHeight - viewport;
    else return;
    scrollY.current = y;
    listRef.current?.scrollTo({ y, animated: false });
  };

  /**
   * Closes, then runs. A command acting on the list, or focusing a field, has to
   * land on the window with this dialog gone: on the Mac a list command is
   * refused while anything is presented over the list, and a field can't take
   * focus from under a dialog. The exceptions run where they are: a picker
   * opening in this same menu, and a tag toggled with the picker still up.
   */
  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    if (entry.keepOpen) {
      entry.run();
      return;
    }
    onClose();
    setTimeout(entry.run, Platform.OS === 'web' ? 0 : 250);
  };

  /**
   * Where the pointer was when a row last heard it. A row only takes the
   * selection from a pointer that has moved since: one resting where the menu
   * happens to open is not a choice. The Mac reports a pointer event when ⌘ is
   * let go, and the web when rows move under a still pointer, and either would
   * otherwise pull the selection off the first row the moment the menu opens.
   */
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const pointTo = (i: number, e: PointerEvent) => {
    const { clientX: x, clientY: y } = e.nativeEvent;
    const last = pointerAt.current;
    pointerAt.current = { x, y };
    if (last && (last.x !== x || last.y !== y)) setIndex(i);
  };

  const move = (delta: number) => {
    if (results.length === 0) return;
    const next = (selected + delta + results.length) % results.length;
    setIndex(next);
    reveal(next);
  };

  const field = (
    <TextInput
      ref={inputRef}
      value={query}
      onChangeText={(text) => {
        setQuery(text);
        setIndex(0);
        reveal(0);
      }}
      placeholder={picker ? PICKER_PLACEHOLDER[picker.kind] : 'Go to or do…'}
      accessibilityLabel={reference ? 'Search keyboard shortcuts' : undefined}
      placeholderTextColor={colors.textFaint}
      style={[styles.input, focusStyle && { borderBottomColor: focusStyle.borderColor }]}
      {...focusProps}
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

  const title = picker ? PICKER_TITLE[picker.kind] : SEARCH_TITLE;
  const count = picker && 'taskIds' in picker && picker.taskIds.length > 1 ? ` · ${picker.taskIds.length} tasks` : '';

  return (
    <Dialog
      visible={visible}
      onClose={picker ? onLeavePicker : onClose}
      onShow={() => inputRef.current?.focus()}
      fade={false}
      width={520}
      topAligned
      header={(
        <View style={styles.header}>
          <Text style={styles.heading} accessibilityRole="header">
            {title}
            {count}
          </Text>
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
        </View>
      )}
    >
      {reference ? (
        <>
          {shortcuts.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.rows.map((row) => (
                <View key={row.title} style={[styles.row, { height: rowHeight }]}>
                  <Text style={styles.title} numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text style={styles.shortcut}>{row.keys}</Text>
                </View>
              ))}
            </View>
          ))}
          {shortcuts.length === 0 && <Text style={styles.empty}>No shortcuts match.</Text>}
          <Pressable onPress={() => openLink(LINKS.keyboard)} style={styles.more} accessibilityRole="link">
            <Text style={[styles.moreText, { color: accent }]}>All shortcuts, explained</Text>
          </Pressable>
        </>
      ) : (
        <ScrollView
          ref={listRef}
          style={{ maxHeight: rowHeight * MAX_ROWS }}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="always"
        >
          {results.length === 0 && (
            <Text style={styles.empty}>
              {picker?.kind === 'editTags' && !query.trim() ? 'Type a name to make a tag.' : 'Nothing matches.'}
            </Text>
          )}
          {results.map((entry, i) => (
            <Pressable
              key={entry.key}
              onPress={() => choose(entry)}
              onPointerEnter={(e) => pointTo(i, e)}
              onPointerMove={(e) => pointTo(i, e)}
              style={[styles.row, { height: rowHeight }, i === selected && styles.rowSelected]}
            >
              {picker && picker.kind !== 'goToTask' && <Text style={styles.check}>{entry.checked ? '✓' : ''}</Text>}
              <Text style={styles.title} numberOfLines={1}>
                {!!entry.prefix && <Text style={styles.prefix}>{entry.prefix} </Text>}
                {entry.title}
              </Text>
              {!!entry.detail && (
                <Text style={entry.detailIsShortcut ? styles.shortcut : styles.kind}>{entry.detail}</Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Dialog>
  );
}

const useStyles = makeStyles((c) => ({
  header: {
    paddingHorizontal: 16,
  },
  heading: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    borderRadius: 7,
  },
  section: {
    marginTop: 6,
  },
  sectionTitle: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  more: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  moreText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  check: {
    width: 14,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: c.textPrimary,
  },
  prefix: {
    color: c.textTertiary,
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

import React, { useRef } from 'react';
import { Text, View } from 'react-native';
import Pressable from './HoverPressable';
import Dialog from './Dialog';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { MAC } from '../data/platform';
import { LINKS, openLink } from '../data/links';
import { COMMANDS, CommandDef, CommandId, Shortcut, formatShortcut, paletteTitle } from '../navigation/commands';
import { MAC_KEYS } from './CommandPalette';

interface Row {
  title: string;
  keys: string;
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
 * on the docs page this links to.
 */
function sections(): { title: string; rows: Row[] }[] {
  const fmt = (input: string, ...modifiers: Shortcut['modifiers']) => formatShortcut({ input, modifiers }, MAC_KEYS);
  const window: Row[] = [
    { title: 'Next pane or field', keys: fmt('tab') },
    { title: 'Previous pane or field', keys: fmt('tab', 'shift') },
    { title: 'Leave a field for the list', keys: fmt('escape') },
  ];
  const list: Row[] = [];
  const editing: Row[] = [
    { title: 'Title to notes', keys: fmt('return') },
  ];
  if (MAC) {
    window.push({
      title: 'All, Inbox, Today, Calendar, Activity, Browse, Trash',
      keys: `${fmt('1', 'command')} – ${fmt('7', 'command')}`,
    });
  }
  for (const def of COMMANDS) {
    if (VIEW_IDS.has(def.id) || def.menu === 'help') continue;
    const keys = keysFor(def, MAC_KEYS);
    if (!keys) continue;
    const row = { title: def.hiddenFromPalette ? def.title : paletteTitle(def), keys };
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
  // On the web a modal closes on Escape only with focus inside it, and nothing
  // here is a field to take it. (The Mac's dialog takes the key itself.)
  const linkRef = useRef<View>(null);
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      onShow={() => (linkRef.current as unknown as { focus?: () => void } | null)?.focus?.()}
      width={560}
      header={<Text style={styles.heading}>Keyboard Shortcuts</Text>}
    >
      {sections().map((section) => (
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
      <Pressable ref={linkRef} onPress={() => openLink(LINKS.keyboard)} style={styles.more} accessibilityRole="link">
        <Text style={[styles.moreText, { color: accent }]}>All shortcuts, explained</Text>
      </Pressable>
    </Dialog>
  );
}

const useStyles = makeStyles((c) => ({
  heading: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    color: c.textPrimary,
    marginBottom: 4,
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
}));

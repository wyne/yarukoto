import { DESKTOP_APP, MAC, MAC_KEYS } from './platform';
import { ShortcutSearchRow, ShortcutSearchSection, shortcutSearchTerms } from './shortcutSearch';
import { COMMANDS, CommandDef, CommandId, Shortcut, formatShortcut, paletteTitle } from '../navigation/commands';

/** The views, which are eight commands but one row: ⌘1 to ⌘8. */
const VIEW_IDS = new Set<CommandId>(['goAll', 'goInbox', 'goToday', 'goCalendar', 'goActivity', 'goBrowse', 'goTrash', 'goArchive']);
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
 * Every key, in one place — Help ▸ Keyboard Shortcuts, or ⌘/, which the
 * command menu shows in place of its search.
 *
 * Built from the command list, as the menu bar and ⌘K are, so it can't teach a
 * key the app doesn't have. The few keys that belong to fields rather than to
 * commands — Tab and Escape between panes — are spelled out here, as they are
 * on the docs page this links to. Search narrows this complete, read-only
 * reference; unlike ⌘K, it does not depend on what the current screen can do.
 */
export function shortcutSections(): ShortcutSearchSection[] {
  const fmt = (input: string, ...modifiers: Shortcut['modifiers']) => formatShortcut({ input, modifiers }, MAC_KEYS);
  const terms = (input: string, ...modifiers: Shortcut['modifiers']) => shortcutSearchTerms([{ input, modifiers }]);
  const window: ShortcutSearchRow[] = [
    { title: 'Next pane or field', keys: fmt('tab'), searchTerms: terms('tab') },
    { title: 'Previous pane or field', keys: fmt('tab', 'shift'), searchTerms: terms('tab', 'shift') },
    { title: 'Leave a field for the list', keys: fmt('escape'), searchTerms: terms('escape') },
  ];
  const list: ShortcutSearchRow[] = [];
  const editing: ShortcutSearchRow[] = [
    { title: 'Title to notes', keys: fmt('return'), searchTerms: terms('return') },
    // completeTask's key, answered by the subtask field that has the caret.
    { title: 'Check off subtask', keys: fmt('return', 'command'), searchTerms: `complete done finish ${terms('return', 'command')}` },
  ];
  // The task switcher, heard as ⌃ comes up rather than through a command (TaskSwitcher.tsx).
  if (DESKTOP_APP) {
    window.push(
      {
        title: 'Recent tasks: next',
        keys: fmt('tab', 'control'),
        searchTerms: `switcher switch previous last back ${terms('tab', 'control')}`,
      },
      {
        title: 'Recent tasks: previous',
        keys: `${fmt('tab', 'control', 'shift')}${MAC_KEYS ? '  ' : ', '}${fmt('`', 'control')}`,
        searchTerms: `switcher switch backwards ${terms('tab', 'control', 'shift')} grave backtick`,
      }
    );
  }
  if (MAC) {
    const viewShortcuts = Array.from({ length: 8 }, (_, i): Shortcut => ({
      input: String(i + 1),
      modifiers: ['command'],
    }));
    window.push({
      title: 'All, Inbox, Today, Plan, Activity, Browse, Trash, Archive',
      keys: `${fmt('1', 'command')} – ${fmt('8', 'command')}`,
      searchTerms: shortcutSearchTerms(viewShortcuts),
    });
  }
  for (const def of COMMANDS) {
    // The plain ⌫ that only names ⌘⌫ isn't a key to learn.
    if (VIEW_IDS.has(def.id) || def.id === 'trashKeyHint') continue;
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

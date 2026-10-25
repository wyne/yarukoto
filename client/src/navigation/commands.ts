/**
 * Every command the app answers from the keyboard, in one list.
 *
 * The Mac menu bar is built from it (modules/mac-menu), the web answers the
 * shortcuts marked `web` from it, and the command menu (⌘K) lists it with each
 * shortcut beside its title. One list is what keeps the three from disagreeing
 * about what a key does, or the palette from teaching a shortcut the menu bar
 * doesn't have.
 *
 * Pure data and pure functions: nothing here knows who answers a command. That
 * is `useCommand` in MenuCommands.tsx.
 */

export type Modifier = 'command' | 'shift' | 'option' | 'control';

/**
 * A key, by name. A letter or digit is itself, lowercase; the rest are the
 * names below, which MacMenuBar.swift maps to UIKit's inputs.
 */
export type KeyInput = string;

export interface Shortcut {
  input: KeyInput;
  modifiers: Modifier[];
  /**
   * A plain key pressed just before this one, for a two-key list key: `gg`, `za`.
   * Only ever a list key, since nothing else can wait for a second key.
   */
  prefix?: KeyInput;
}

/** Which menu a command sits in on the Mac. `app` is the menu named Yarukoto. */
export type MenuPlacement = 'app' | 'file' | 'edit' | 'view' | 'task' | 'help';

export type CommandId =
  | 'settings'
  | 'closeWindow'
  | 'checkForUpdates'
  | 'newTask'
  | 'goToTask'
  | 'find'
  | 'commandMenu'
  | 'goAll'
  | 'goInbox'
  | 'goToday'
  | 'goCalendar'
  | 'goActivity'
  | 'goBrowse'
  | 'goTrash'
  | 'openTask'
  | 'editTask'
  | 'firstTask'
  | 'lastTask'
  | 'pageDown'
  | 'pageUp'
  | 'nextGroup'
  | 'previousGroup'
  | 'scrollLineDown'
  | 'scrollLineUp'
  | 'toggleFold'
  | 'openFold'
  | 'closeFold'
  | 'openAllFolds'
  | 'closeAllFolds'
  | 'focusTaskPane'
  | 'focusSidebar'
  | 'toggleSidebar'
  | 'toggleTaskPane'
  | 'textBigger'
  | 'textSmaller'
  | 'textActualSize'
  | 'groupByNone'
  | 'groupByList'
  | 'groupByDate'
  | 'groupByTag'
  | 'groupByPriority'
  | 'sortByManual'
  | 'sortByDate'
  | 'sortByTitle'
  | 'sortByTag'
  | 'sortByPriority'
  | 'keyboardShortcuts'
  | 'nextTask'
  | 'previousTask'
  | 'selectNext'
  | 'selectPrevious'
  | 'completeTask'
  | 'dueToday'
  | 'dueTomorrow'
  | 'clearDue'
  | 'priorityHigh'
  | 'priorityMedium'
  | 'priorityLow'
  | 'priorityNone'
  | 'showHistory'
  | 'deleteTask'
  | 'trashKeyHint'
  | 'moveToList'
  | 'editTags'
  | 'deselect'
  | 'nextPane'
  | 'previousPane'
  | 'bold'
  | 'italic'
  | 'help'
  | 'support'
  | 'privacy';

export interface CommandDef {
  id: CommandId;
  title: string;
  /** Left out of the menu bar when absent, as list movement is in every Mac app. */
  menu?: MenuPlacement;
  /** Commands sharing a group sit together between separators. */
  group: string;
  /** Drawn as a submenu of this name inside its group. */
  submenu?: string;
  /** The menu bar's key for it, which works whatever has focus. Always has ⌘. */
  shortcut?: Shortcut;
  /**
   * Plain keys — ↑, ↓, Return, Escape, Delete — answered by the task list itself while
   * it has focus, rather than by the menu bar. A key equivalent in the menu bar
   * fires before anything focused hears the key, so a plain one there would
   * take Return from every text field and ↑ from the command menu. Held by the
   * list instead, a field or a dialog that has focus keeps them.
   */
  listKeys?: Shortcut[];
  /**
   * Acts on the task list in front. Never runs while a dialog or popover is up,
   * so a key pressed in one can't reach the list behind it.
   */
  list?: boolean;
  /**
   * The web build answers `shortcut` too. Only keys a browser lets a page have:
   * ⌘N and ⌘T open windows and tabs before any page hears them. `listKeys` it
   * always answers.
   */
  web?: boolean;
  /** Left out of the command menu: moving a cursor means nothing from a search box. */
  hiddenFromPalette?: boolean;
  /** Extra words the command menu matches, beyond the title. */
  keywords?: string;
  /** A visible category before the command's title in the command menu. */
  palettePrefix?: string;
  /** A command-menu-specific title when the menu-bar wording needs more context. */
  paletteTitle?: string;
  /**
   * Opens a picker in the command menu rather than acting at once, so choosing
   * it there keeps the menu open instead of closing it first.
   */
  picker?: boolean;
}

const cmd = (input: KeyInput, ...extra: Modifier[]): Shortcut => ({ input, modifiers: ['command', ...extra] });
const plain = (input: KeyInput, ...modifiers: Modifier[]): Shortcut => ({ input, modifiers });
const after = (prefix: KeyInput, input: KeyInput, ...modifiers: Modifier[]): Shortcut => ({ prefix, input, modifiers });

/** In menu order: menus as listed, groups as first met. */
export const COMMANDS: readonly CommandDef[] = [
  { id: 'checkForUpdates', title: 'Check for Updates…', menu: 'app', group: 'updates', keywords: 'version upgrade download' },
  { id: 'settings', title: 'Settings…', menu: 'app', group: 'settings', shortcut: cmd(','), keywords: 'preferences server theme' },

  { id: 'newTask', title: 'New Task', menu: 'file', group: 'new', shortcut: cmd('n'), keywords: 'add create' },
  // File ▸ Open…'s key, for the thing this app opens: a search of the open
  // tasks by title, in the command menu.
  { id: 'goToTask', title: 'Go to Task…', menu: 'file', group: 'new', shortcut: cmd('o'), web: true, picker: true, keywords: 'open find search jump' },
  // In place of the system's Close, which Catalyst leaves dimmed. Mac only (MacStatusMenu).
  { id: 'closeWindow', title: 'Close Window', menu: 'file', group: 'close', shortcut: cmd('w'), hiddenFromPalette: true },

  { id: 'find', title: 'Find…', menu: 'edit', group: 'find', shortcut: cmd('f'), keywords: 'search browse' },
  // Answered by the notes editor while it has focus. The system's Format menu,
  // where these keys would otherwise live, is removed (MacMenuBar.swift).
  { id: 'bold', title: 'Bold', menu: 'edit', group: 'format', shortcut: cmd('b'), web: true, hiddenFromPalette: true },
  { id: 'italic', title: 'Italic', menu: 'edit', group: 'format', shortcut: cmd('i'), web: true, hiddenFromPalette: true },

  { id: 'commandMenu', title: 'Command Menu…', menu: 'view', group: 'commandMenu', shortcut: cmd('k'), web: true, hiddenFromPalette: true },
  // ⌘S and ⌘D, for Sidebar and Details: one key each, since nothing here saves.
  // Not ⌃⌘S, which the system's own Show Sidebar item has (UIKit drops the whole
  // inserted View section over one clashing key), and not ⌘B or ⌘I, which are
  // Bold and Italic in the notes. Neither is on the web, where the browser keeps
  // ⌘S and ⌘D for saving and bookmarking.
  { id: 'toggleSidebar', title: 'Toggle Sidebar', menu: 'view', group: 'panes', shortcut: cmd('s'), keywords: 'show hide collapse' },
  { id: 'toggleTaskPane', title: 'Toggle Task Pane', menu: 'view', group: 'panes', shortcut: cmd('d'), list: true, keywords: 'show hide inspector detail' },
  // The desktop's text size. Phones follow the system's; the Mac app takes none
  // from the system, and the Windows app's engine has its own zoom turned off.
  // Marked `web` for the Windows app, but only the apps answer: a browser keeps
  // these keys for its own zoom, which already does the job there.
  { id: 'textBigger', title: 'Bigger Text', menu: 'view', group: 'textSize', shortcut: cmd('='), web: true, keywords: 'zoom in larger font size increase' },
  { id: 'textSmaller', title: 'Smaller Text', menu: 'view', group: 'textSize', shortcut: cmd('-'), web: true, keywords: 'zoom out font size decrease' },
  { id: 'textActualSize', title: 'Actual Size', menu: 'view', group: 'textSize', shortcut: cmd('0'), web: true, keywords: 'zoom reset text font size default' },
  // The task list's Group & sort, as View menus in Finder and Mail have it. The
  // option in use is checked, and left out of the command menu.
  { id: 'groupByNone', title: 'None', menu: 'view', group: 'arrange', submenu: 'Group By', keywords: 'ungroup arrange' },
  { id: 'groupByList', title: 'List', menu: 'view', group: 'arrange', submenu: 'Group By', keywords: 'arrange' },
  { id: 'groupByDate', title: 'Date', menu: 'view', group: 'arrange', submenu: 'Group By', keywords: 'arrange due' },
  { id: 'groupByTag', title: 'Tag', menu: 'view', group: 'arrange', submenu: 'Group By', keywords: 'arrange' },
  { id: 'groupByPriority', title: 'Priority', menu: 'view', group: 'arrange', submenu: 'Group By', keywords: 'arrange' },
  { id: 'sortByManual', title: 'Custom', menu: 'view', group: 'arrange', submenu: 'Sort By', keywords: 'order manual arrange' },
  { id: 'sortByDate', title: 'Date', menu: 'view', group: 'arrange', submenu: 'Sort By', keywords: 'order arrange due' },
  { id: 'sortByTitle', title: 'Title', menu: 'view', group: 'arrange', submenu: 'Sort By', keywords: 'order arrange name alphabetical' },
  { id: 'sortByTag', title: 'Tag', menu: 'view', group: 'arrange', submenu: 'Sort By', keywords: 'order arrange' },
  { id: 'sortByPriority', title: 'Priority', menu: 'view', group: 'arrange', submenu: 'Sort By', keywords: 'order arrange' },
  // In sidebar order, so the number is the row. Not on the web: a browser keeps
  // ⌘1–9 (Ctrl+1–9) for its own tabs. The command menu already lists every view.
  { id: 'goAll', title: 'All', menu: 'view', group: 'go', shortcut: cmd('1'), hiddenFromPalette: true },
  { id: 'goInbox', title: 'Inbox', menu: 'view', group: 'go', shortcut: cmd('2'), hiddenFromPalette: true },
  { id: 'goToday', title: 'Agenda', menu: 'view', group: 'go', shortcut: cmd('3'), hiddenFromPalette: true },
  { id: 'goCalendar', title: 'Plan', menu: 'view', group: 'go', shortcut: cmd('4'), hiddenFromPalette: true },
  { id: 'goActivity', title: 'Activity', menu: 'view', group: 'go', shortcut: cmd('5'), hiddenFromPalette: true },
  { id: 'goBrowse', title: 'Browse', menu: 'view', group: 'go', shortcut: cmd('6'), hiddenFromPalette: true },
  { id: 'goTrash', title: 'Trash', menu: 'view', group: 'go', shortcut: cmd('7'), hiddenFromPalette: true },

  // Space opens the task beside the list and leaves the keyboard on the list,
  // as Quick Look does; Return opens it to edit, with the caret in its title.
  { id: 'openTask', title: 'Open Task', menu: 'task', group: 'open', listKeys: [plain('space')], list: true },
  { id: 'editTask', title: 'Edit Task', group: 'open', listKeys: [plain('return')], list: true, hiddenFromPalette: true },
  // The letters are vim's: j and k, gg and G, { and } between groups, ⌃E and ⌃Y to
  // scroll. A letter is a list key like any other, so it only reaches the list
  // while no field has the keyboard — typing a j in the add field types a j.
  { id: 'nextTask', title: 'Next Task', group: 'move', listKeys: [plain('down'), plain('j')], list: true, hiddenFromPalette: true },
  { id: 'previousTask', title: 'Previous Task', group: 'move', listKeys: [plain('up'), plain('k')], list: true, hiddenFromPalette: true },
  // ⌘↑ is "start of text" in a field, so it is a list key, not a menu one.
  { id: 'firstTask', title: 'First Task', group: 'move', listKeys: [plain('up', 'command'), plain('home'), after('g', 'g')], list: true, hiddenFromPalette: true },
  { id: 'lastTask', title: 'Last Task', group: 'move', listKeys: [plain('down', 'command'), plain('end'), plain('g', 'shift')], list: true, hiddenFromPalette: true },
  { id: 'pageDown', title: 'Page Down', group: 'move', listKeys: [plain('pagedown')], list: true, hiddenFromPalette: true },
  { id: 'pageUp', title: 'Page Up', group: 'move', listKeys: [plain('pageup')], list: true, hiddenFromPalette: true },
  // Into the next group, or back to the start of this one and then the one before.
  { id: 'nextGroup', title: 'Next Group', group: 'move', listKeys: [plain('}')], list: true, hiddenFromPalette: true },
  { id: 'previousGroup', title: 'Previous Group', group: 'move', listKeys: [plain('{')], list: true, hiddenFromPalette: true },
  // A row's worth of scrolling, leaving the cursor where it is until it would go off screen.
  { id: 'scrollLineDown', title: 'Scroll Down', group: 'move', listKeys: [plain('e', 'control')], list: true, hiddenFromPalette: true },
  { id: 'scrollLineUp', title: 'Scroll Up', group: 'move', listKeys: [plain('y', 'control')], list: true, hiddenFromPalette: true },
  // The cursor's group. A folded group is a stop of its own for the keys above,
  // so the keyboard can reach it to unfold it again.
  { id: 'toggleFold', title: 'Fold or Unfold Group', group: 'fold', listKeys: [after('z', 'a')], list: true, keywords: 'collapse expand section toggle' },
  { id: 'openFold', title: 'Unfold Group', group: 'fold', listKeys: [after('z', 'o')], list: true, keywords: 'expand open section' },
  { id: 'closeFold', title: 'Fold Group', group: 'fold', listKeys: [after('z', 'c')], list: true, keywords: 'collapse close section' },
  { id: 'openAllFolds', title: 'Unfold All Groups', group: 'fold', listKeys: [after('z', 'r', 'shift')], list: true, keywords: 'expand open sections' },
  { id: 'closeAllFolds', title: 'Fold All Groups', group: 'fold', listKeys: [after('z', 'm', 'shift')], list: true, keywords: 'collapse close sections' },
  { id: 'focusTaskPane', title: 'Into the Task Pane', group: 'move', listKeys: [plain('right')], list: true, hiddenFromPalette: true },
  { id: 'focusSidebar', title: 'To the Sidebar', group: 'move', listKeys: [plain('left')], list: true, hiddenFromPalette: true },
  { id: 'selectNext', title: 'Add Next to Selection', group: 'move', listKeys: [plain('down', 'shift')], list: true, hiddenFromPalette: true },
  { id: 'selectPrevious', title: 'Add Previous to Selection', group: 'move', listKeys: [plain('up', 'shift')], list: true, hiddenFromPalette: true },
  // Clears a selection, or else closes the task open beside the list.
  { id: 'deselect', title: 'Deselect', group: 'move', listKeys: [plain('escape')], list: true, hiddenFromPalette: true },
  // Round the window's panes: the add field, the list, the task open beside it
  // (focusPanes.ts). A field answers its own Tab, so these are only the list's.
  { id: 'nextPane', title: 'Next Pane', group: 'move', listKeys: [plain('tab')], list: true, hiddenFromPalette: true },
  { id: 'previousPane', title: 'Previous Pane', group: 'move', listKeys: [plain('tab', 'shift')], list: true, hiddenFromPalette: true },

  { id: 'completeTask', title: 'Mark as Done', menu: 'task', group: 'complete', shortcut: cmd('return'), list: true, web: true, keywords: 'complete check finish' },

  { id: 'dueToday', title: 'Due Today', menu: 'task', group: 'due', shortcut: cmd('t'), list: true, keywords: 'date schedule', palettePrefix: 'Set', paletteTitle: 'Due Date: Today' },
  { id: 'dueTomorrow', title: 'Due Tomorrow', menu: 'task', group: 'due', shortcut: cmd('t', 'option'), list: true, web: true, keywords: 'date schedule snooze', palettePrefix: 'Set', paletteTitle: 'Due Date: Tomorrow' },
  { id: 'clearDue', title: 'Remove Due Date', menu: 'task', group: 'due', list: true, keywords: 'date schedule clear remove', palettePrefix: 'Set', paletteTitle: 'Due Date: None' },

  { id: 'priorityHigh', title: 'High', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('1', 'option'), list: true, web: true, palettePrefix: 'Set' },
  { id: 'priorityMedium', title: 'Medium', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('2', 'option'), list: true, web: true, palettePrefix: 'Set' },
  { id: 'priorityLow', title: 'Low', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('3', 'option'), list: true, web: true, palettePrefix: 'Set' },
  { id: 'priorityNone', title: 'None', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('0', 'option'), list: true, web: true, palettePrefix: 'Set' },

  // Each opens a picker in the command menu, for the tasks the list's commands act on.
  // ⇧⌘M as in Things. Neither on the web, where ⇧⌘T reopens a closed tab.
  { id: 'moveToList', title: 'Move to List…', menu: 'task', group: 'organize', shortcut: cmd('m', 'shift'), list: true, picker: true, keywords: 'list folder file' },
  { id: 'editTags', title: 'Edit Tags…', menu: 'task', group: 'organize', shortcut: cmd('t', 'shift'), list: true, picker: true, keywords: 'tag label add remove' },

  // Answered by the open task's pane, so it needs no selection of its own.
  { id: 'showHistory', title: 'Show History…', menu: 'task', group: 'history', keywords: 'activity changes revisions log' },

  // ⌘⌫ held by the list, not by the menu bar: a menu key equivalent fires
  // whatever has focus, and ⌘⌫ is "delete to start of line" in every text
  // field, the note editor included. Not a plain ⌫ either: that is the key a
  // hand reaches for to fix a typo, and the keyboard can be on the list
  // without the eye having followed it there. A plain ⌫ only says which key
  // trashes, so a stray one costs nothing.
  { id: 'deleteTask', title: 'Move to Trash', menu: 'task', group: 'delete', listKeys: [plain('delete', 'command')], list: true, keywords: 'delete remove' },
  { id: 'trashKeyHint', title: 'Move to Trash Key', group: 'delete', listKeys: [plain('delete')], list: true, hiddenFromPalette: true },

  // In place of the system's "Yarukoto Help", which only says help isn't
  // available. Each opens a page in the browser (src/data/links.ts).
  { id: 'keyboardShortcuts', title: 'Keyboard Shortcuts', menu: 'help', group: 'docs', shortcut: cmd('/'), web: true, keywords: 'keys hotkeys help' },
  { id: 'help', title: 'Yarukoto Help', menu: 'help', group: 'docs', keywords: 'docs documentation guide setup server' },
  { id: 'support', title: 'Contact Support', menu: 'help', group: 'support', keywords: 'help bug issue feedback email' },
  { id: 'privacy', title: 'Privacy Policy', menu: 'help', group: 'support', keywords: 'data' },
];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

export function commandDef(id: CommandId): CommandDef {
  return BY_ID.get(id)!;
}

/** What the command menu calls it: a submenu's items need their submenu to make sense. */
export function paletteTitle(def: CommandDef): string {
  if (def.paletteTitle) return def.paletteTitle;
  return def.submenu ? `${def.submenu}: ${def.title}` : def.title.replace(/…$/, '');
}

// ⌃⌥⇧⌘ is the order every Mac menu draws them in.
const MODIFIER_ORDER: Modifier[] = ['control', 'option', 'shift', 'command'];
// Ctrl+Shift+Alt elsewhere, with ⌘ standing in as Ctrl.
const PC_MODIFIER_ORDER: Modifier[] = ['command', 'control', 'shift', 'option'];
const MAC_GLYPH: Record<Modifier, string> = { control: '⌃', option: '⌥', shift: '⇧', command: '⌘' };
const PC_NAME: Record<Modifier, string> = { control: 'Ctrl', option: 'Alt', shift: 'Shift', command: 'Ctrl' };
const KEY_GLYPH: Record<string, string> = {
  return: '↩',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  delete: '⌫',
  escape: '⎋',
  tab: '⇥',
  space: 'Space',
  home: '↖',
  end: '↘',
  pageup: '⇞',
  pagedown: '⇟',
};
const PC_KEY: Record<string, string> = {
  return: 'Enter',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  delete: 'Backspace',
  escape: 'Esc',
  tab: 'Tab',
  space: 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'PgUp',
  pagedown: 'PgDn',
};

/**
 * A key that types a character, pressed with nothing but Shift: drawn as the
 * character it types — `j`, `G`, `}` — the way vim's keys are written.
 */
function typedGlyph(shortcut: Shortcut): string | undefined {
  const { input, modifiers } = shortcut;
  if (input.length !== 1 || modifiers.some((m) => m !== 'shift')) return undefined;
  return modifiers.includes('shift') ? input.toUpperCase() : input;
}

/**
 * A shortcut as a menu draws it: `⌥⌘1`, or `Ctrl+Alt+1` away from a Mac, where
 * the command key is Control.
 */
export function formatShortcut(shortcut: Shortcut, mac: boolean): string {
  const prefix = shortcut.prefix ?? '';
  const typed = typedGlyph(shortcut);
  if (typed) return prefix + typed;
  const order = mac ? MODIFIER_ORDER : PC_MODIFIER_ORDER;
  const mods = order.filter((m) => shortcut.modifiers.includes(m));
  if (mac) {
    const key = KEY_GLYPH[shortcut.input] ?? shortcut.input.toUpperCase();
    return mods.map((m) => MAC_GLYPH[m]).join('') + key;
  }
  const key = PC_KEY[shortcut.input] ?? shortcut.input.toUpperCase();
  return [...mods.map((m) => PC_NAME[m]), key].join('+');
}

/** The parts of a DOM keyboard event a shortcut is matched on. */
export interface KeyEventLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const DOM_KEYS: Record<string, KeyInput> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'return',
  Backspace: 'delete',
  Delete: 'delete',
  Escape: 'escape',
  Tab: 'tab',
  ' ': 'space',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
};

/** The key a DOM event names, in this file's terms. */
export function keyInputOf(event: KeyEventLike): KeyInput {
  // A typed key is the character it types, as vim reads it: j is j on any
  // layout, and } is } whichever keys make it.
  if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1 && event.key !== ' ') {
    return event.key.toLowerCase();
  }
  // The physical key for letters and digits: with ⌥ held a Mac reports the
  // character it would type (⌥1 is ¡), not the key that was pressed.
  const code = event.code ?? '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return DOM_KEYS[event.key] ?? event.key.toLowerCase();
}

/**
 * Whether a DOM key event is this shortcut. ⌘ is the Command key on a Mac and
 * Control elsewhere, so either one answers `command` — but not both, and not
 * Control standing in for `control` itself, which no web shortcut uses.
 */
export function matchesShortcut(shortcut: Shortcut, event: KeyEventLike): boolean {
  // One event is one key; a two-key one is read by `createKeySequenceReader`.
  if (shortcut.prefix !== undefined || keyInputOf(event) !== shortcut.input) return false;
  const wants = (m: Modifier) => shortcut.modifiers.includes(m);
  const command = event.metaKey !== event.ctrlKey && (event.metaKey || event.ctrlKey);
  const none = !event.metaKey && !event.ctrlKey;
  // Control itself, for vim's ⌃E and ⌃Y: on Windows that is also ⌘, but no
  // command uses ⌘ with the same letter.
  if (wants('control') ? !event.ctrlKey || event.metaKey : wants('command') ? !command : !none) return false;
  // A symbol is the character, whichever keys a layout types it with: `}` is
  // ⇧] on one keyboard and a key of its own on another.
  const symbol = shortcut.input.length === 1 && !/[a-z0-9]/.test(shortcut.input);
  return wants('option') === event.altKey && (symbol || wants('shift') === event.shiftKey);
}

/**
 * The command a DOM key event asks for, among those the web answers, and
 * whether it came as one of the list's plain keys — which a field being typed
 * in keeps for itself.
 */
export function webCommandFor(event: KeyEventLike): { def: CommandDef; listKey: boolean } | undefined {
  for (const def of COMMANDS) {
    if (def.web && def.shortcut && matchesShortcut(def.shortcut, event)) return { def, listKey: false };
    if (def.listKeys?.some((k) => matchesShortcut(k, event))) return { def, listKey: true };
  }
  return undefined;
}

/** A list key as KeyCommandsView names it: `shift+down`, `return`, and `z shift+r` for two keys. */
export function keyName(shortcut: Shortcut): string {
  const name = [...MODIFIER_ORDER.filter((m) => shortcut.modifiers.includes(m)), shortcut.input].join('+');
  return shortcut.prefix !== undefined ? `${shortcut.prefix} ${name}` : name;
}

/**
 * A DOM key event as `keyName` would name it, for the web's KeyCommandsView:
 * `shift+tab`, `escape`. ⌘ and Control each keep their own name here, unlike
 * `matchesShortcut`: these are plain keys, which neither modifier belongs to.
 */
export function domKeyName(event: KeyEventLike): string {
  const held: Record<Modifier, boolean> = {
    control: event.ctrlKey,
    option: event.altKey,
    shift: event.shiftKey,
    command: event.metaKey,
  };
  return [...MODIFIER_ORDER.filter((m) => held[m]), keyInputOf(event)].join('+');
}

/** Every plain key the task list answers, by `keyName`, and what it runs. */
export const LIST_KEYS: ReadonlyMap<string, CommandId> = new Map(
  COMMANDS.flatMap((def) => (def.listKeys ?? []).map((k) => [keyName(k), def.id] as const))
);

/** The keys that start a two-key list key, and do nothing of their own: `g`, `z`. */
const SEQUENCE_PREFIXES: ReadonlySet<string> = new Set(
  COMMANDS.flatMap((def) => (def.listKeys ?? []).flatMap((k) => (k.prefix !== undefined ? [k.prefix] : [])))
);

/** Every single key a list has to hear, each half of a two-key one included. */
export const LIST_KEY_NAMES: readonly string[] = [...new Set([...LIST_KEYS.keys()].flatMap((name) => name.split(' ')))];

/** How long the first of two keys waits for the second, as vim's own `timeoutlen`. */
export const SEQUENCE_MS = 1000;

/**
 * Reads two-key list keys out of the keys as they come, by `keyName`.
 *
 * A prefix answers `pending` and waits. The next key either finishes a pair,
 * answering its command, or is taken on its own — `undefined`, for the caller
 * to look up as a single key — so `g` then `j` still moves down. A key that
 * isn't part of any pair answers `undefined` straight away.
 */
export function createKeySequenceReader(timeoutMs = SEQUENCE_MS) {
  let prefix: string | null = null;
  let at = 0;
  return (name: string, now: number = Date.now()): CommandId | 'pending' | undefined => {
    const held = prefix !== null && now - at <= timeoutMs ? prefix : null;
    prefix = null;
    if (held !== null) {
      const id = LIST_KEYS.get(`${held} ${name}`);
      if (id) return id;
    }
    if (SEQUENCE_PREFIXES.has(name)) {
      prefix = name;
      at = now;
      return 'pending';
    }
    return undefined;
  };
}

/** The key the command menu shows for a command: its menu shortcut, else its list key. */
export function displayShortcut(def: CommandDef, web: boolean): Shortcut | undefined {
  if (def.shortcut && (!web || def.web)) return def.shortcut;
  return def.listKeys?.[0];
}

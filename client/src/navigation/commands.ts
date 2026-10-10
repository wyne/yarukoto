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
}

/** Which menu a command sits in on the Mac. `app` is the menu named Yarukoto. */
export type MenuPlacement = 'app' | 'file' | 'edit' | 'view' | 'task' | 'help';

export type CommandId =
  | 'settings'
  | 'newTask'
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
  | 'focusTaskPane'
  | 'focusSidebar'
  | 'toggleSidebar'
  | 'toggleTaskPane'
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
  | 'deleteTask'
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
}

const cmd = (input: KeyInput, ...extra: Modifier[]): Shortcut => ({ input, modifiers: ['command', ...extra] });
const plain = (input: KeyInput, ...modifiers: Modifier[]): Shortcut => ({ input, modifiers });

/** In menu order: menus as listed, groups as first met. */
export const COMMANDS: readonly CommandDef[] = [
  { id: 'settings', title: 'Settings…', menu: 'app', group: 'settings', shortcut: cmd(','), keywords: 'preferences server theme' },

  { id: 'newTask', title: 'New Task', menu: 'file', group: 'new', shortcut: cmd('n'), keywords: 'add create' },

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
  // In sidebar order, so the number is the row. Not on the web: a browser keeps
  // ⌘1–9 (Ctrl+1–9) for its own tabs. The command menu already lists every view.
  { id: 'goAll', title: 'All', menu: 'view', group: 'go', shortcut: cmd('1'), hiddenFromPalette: true },
  { id: 'goInbox', title: 'Inbox', menu: 'view', group: 'go', shortcut: cmd('2'), hiddenFromPalette: true },
  { id: 'goToday', title: 'Today', menu: 'view', group: 'go', shortcut: cmd('3'), hiddenFromPalette: true },
  { id: 'goCalendar', title: 'Calendar', menu: 'view', group: 'go', shortcut: cmd('4'), hiddenFromPalette: true },
  { id: 'goActivity', title: 'Activity', menu: 'view', group: 'go', shortcut: cmd('5'), hiddenFromPalette: true },
  { id: 'goBrowse', title: 'Browse', menu: 'view', group: 'go', shortcut: cmd('6'), hiddenFromPalette: true },
  { id: 'goTrash', title: 'Trash', menu: 'view', group: 'go', shortcut: cmd('7'), hiddenFromPalette: true },

  // Space opens the task beside the list and leaves the keyboard on the list,
  // as Quick Look does; Return opens it to edit, with the caret in its title.
  { id: 'openTask', title: 'Open Task', menu: 'task', group: 'open', shortcut: cmd('o'), listKeys: [plain('space')], list: true, web: true },
  { id: 'editTask', title: 'Edit Task', group: 'open', listKeys: [plain('return')], list: true, hiddenFromPalette: true },
  { id: 'nextTask', title: 'Next Task', group: 'move', listKeys: [plain('down')], list: true, hiddenFromPalette: true },
  { id: 'previousTask', title: 'Previous Task', group: 'move', listKeys: [plain('up')], list: true, hiddenFromPalette: true },
  // ⌘↑ is "start of text" in a field, so it is a list key, not a menu one.
  { id: 'firstTask', title: 'First Task', group: 'move', listKeys: [plain('up', 'command'), plain('home')], list: true, hiddenFromPalette: true },
  { id: 'lastTask', title: 'Last Task', group: 'move', listKeys: [plain('down', 'command'), plain('end')], list: true, hiddenFromPalette: true },
  { id: 'pageDown', title: 'Page Down', group: 'move', listKeys: [plain('pagedown')], list: true, hiddenFromPalette: true },
  { id: 'pageUp', title: 'Page Up', group: 'move', listKeys: [plain('pageup')], list: true, hiddenFromPalette: true },
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

  { id: 'dueToday', title: 'Due Today', menu: 'task', group: 'due', shortcut: cmd('t'), list: true, keywords: 'date schedule' },
  { id: 'dueTomorrow', title: 'Due Tomorrow', menu: 'task', group: 'due', shortcut: cmd('t', 'option'), list: true, web: true, keywords: 'date schedule snooze' },
  { id: 'clearDue', title: 'Remove Due Date', menu: 'task', group: 'due', list: true, keywords: 'date schedule clear' },

  { id: 'priorityHigh', title: 'High', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('1', 'option'), list: true, web: true },
  { id: 'priorityMedium', title: 'Medium', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('2', 'option'), list: true, web: true },
  { id: 'priorityLow', title: 'Low', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('3', 'option'), list: true, web: true },
  { id: 'priorityNone', title: 'None', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('0', 'option'), list: true, web: true },

  // Plain Delete on the list, not ⌘⌫ in the menu bar: a menu key equivalent
  // fires whatever has focus, and ⌘⌫ is "delete to start of line" in every
  // text field, the note editor included.
  { id: 'deleteTask', title: 'Move to Trash', menu: 'task', group: 'delete', listKeys: [plain('delete')], list: true, keywords: 'delete remove' },

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
 * A shortcut as a menu draws it: `⌥⌘1`, or `Ctrl+Alt+1` away from a Mac, where
 * the command key is Control.
 */
export function formatShortcut(shortcut: Shortcut, mac: boolean): string {
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
  if (keyInputOf(event) !== shortcut.input) return false;
  const wants = (m: Modifier) => shortcut.modifiers.includes(m);
  const command = event.metaKey !== event.ctrlKey && (event.metaKey || event.ctrlKey);
  const none = !event.metaKey && !event.ctrlKey;
  if (wants('command') ? !command : !none) return false;
  return wants('option') === event.altKey && wants('shift') === event.shiftKey;
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

/** A list key as KeyCommandsView names it: `shift+down`, `return`. */
export function keyName(shortcut: Shortcut): string {
  return [...MODIFIER_ORDER.filter((m) => shortcut.modifiers.includes(m)), shortcut.input].join('+');
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

/** The key the command menu shows for a command: its menu shortcut, else its list key. */
export function displayShortcut(def: CommandDef, web: boolean): Shortcut | undefined {
  if (def.shortcut && (!web || def.web)) return def.shortcut;
  return def.listKeys?.[0];
}

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
export type MenuPlacement = 'app' | 'file' | 'edit' | 'view' | 'task';

export type CommandId =
  | 'settings'
  | 'newTask'
  | 'find'
  | 'commandMenu'
  | 'openTask'
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
  | 'bold'
  | 'italic';

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
   * Plain keys — ↑, ↓, Return, Escape — answered by the task list itself while
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

  { id: 'openTask', title: 'Open Task', menu: 'task', group: 'open', shortcut: cmd('o'), listKeys: [plain('return')], list: true, web: true },
  { id: 'nextTask', title: 'Next Task', group: 'move', listKeys: [plain('down')], list: true, hiddenFromPalette: true },
  { id: 'previousTask', title: 'Previous Task', group: 'move', listKeys: [plain('up')], list: true, hiddenFromPalette: true },
  { id: 'selectNext', title: 'Add Next to Selection', group: 'move', listKeys: [plain('down', 'shift')], list: true, hiddenFromPalette: true },
  { id: 'selectPrevious', title: 'Add Previous to Selection', group: 'move', listKeys: [plain('up', 'shift')], list: true, hiddenFromPalette: true },
  // Clears a selection, or else closes the task open beside the list.
  { id: 'deselect', title: 'Deselect', group: 'move', listKeys: [plain('escape')], list: true, hiddenFromPalette: true },

  { id: 'completeTask', title: 'Mark as Done', menu: 'task', group: 'complete', shortcut: cmd('return'), list: true, web: true, keywords: 'complete check finish' },

  { id: 'dueToday', title: 'Due Today', menu: 'task', group: 'due', shortcut: cmd('t'), list: true, keywords: 'date schedule' },
  { id: 'dueTomorrow', title: 'Due Tomorrow', menu: 'task', group: 'due', shortcut: cmd('t', 'option'), list: true, web: true, keywords: 'date schedule snooze' },
  { id: 'clearDue', title: 'Remove Due Date', menu: 'task', group: 'due', list: true, keywords: 'date schedule clear' },

  { id: 'priorityHigh', title: 'High', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('1', 'option'), list: true, web: true },
  { id: 'priorityMedium', title: 'Medium', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('2', 'option'), list: true, web: true },
  { id: 'priorityLow', title: 'Low', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('3', 'option'), list: true, web: true },
  { id: 'priorityNone', title: 'None', menu: 'task', group: 'priority', submenu: 'Priority', shortcut: cmd('0', 'option'), list: true, web: true },

  { id: 'deleteTask', title: 'Move to Trash', menu: 'task', group: 'delete', shortcut: cmd('delete'), list: true, web: true, keywords: 'delete remove' },
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
};
const PC_KEY: Record<string, string> = {
  return: 'Enter',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  delete: 'Backspace',
  escape: 'Esc',
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

/** Every plain key the task list answers, by `keyName`, and what it runs. */
export const LIST_KEYS: ReadonlyMap<string, CommandId> = new Map(
  COMMANDS.flatMap((def) => (def.listKeys ?? []).map((k) => [keyName(k), def.id] as const))
);

/** The key the command menu shows for a command: its menu shortcut, else its list key. */
export function displayShortcut(def: CommandDef, web: boolean): Shortcut | undefined {
  if (def.shortcut && (!web || def.web)) return def.shortcut;
  return def.listKeys?.[0];
}

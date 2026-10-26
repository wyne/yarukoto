import {
  COMMANDS,
  KeyEventLike,
  LIST_KEYS,
  LIST_KEY_NAMES,
  createKeySequenceReader,
  displayShortcut,
  domKeyName,
  formatShortcut,
  keyName,
  menuKeys,
  keyInputOf,
  matchesShortcut,
  paletteTitle,
  webCommandFor,
} from '../src/navigation/commands';

const key = (k: string, code: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: k,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('the command list', () => {
  test('ids are unique', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('no two commands share a key', () => {
    const keys = COMMANDS.flatMap((c) => [...menuKeys(c), ...(c.listKeys ?? [])])
      .filter((k): k is NonNullable<typeof k> => !!k)
      .map(keyName);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('the menu bar holds no key a field types or edits with, which it would take from every field', () => {
    // ⌃Tab is the one key without ⌘: a field has no use for it.
    const controlTab = (k: { input: string; modifiers: string[] }) => k.input === 'tab' && k.modifiers.includes('control');
    for (const c of COMMANDS) {
      for (const k of menuKeys(c)) expect(k.modifiers.includes('command') || controlTab(k)).toBe(true);
    }
  });

  test('only a command with a menu key has aliases', () => {
    for (const c of COMMANDS) if (c.aliases?.length) expect(c.shortcut).toBeDefined();
  });

  test('every list key is answered by the list, and acts on it unless it is a way out of it', () => {
    // Letters that leave the list for the add field, Browse or the sidebar.
    const waysOut = new Set(['newTask', 'find', 'toggleSidebar']);
    for (const c of COMMANDS) {
      for (const k of c.listKeys ?? []) {
        expect(c.list || waysOut.has(c.id)).toBe(true);
        expect(LIST_KEYS.get(keyName(k))).toBe(c.id);
      }
    }
  });

  test('a submenu item is named with its submenu in the palette', () => {
    const high = COMMANDS.find((c) => c.id === 'priorityHigh')!;
    expect(paletteTitle(high)).toBe('Priority: High');
    expect(paletteTitle(COMMANDS.find((c) => c.id === 'clearDue')!)).toBe('Due Date: None');
    expect(paletteTitle(COMMANDS.find((c) => c.id === 'settings')!)).toBe('Settings');
  });

  test('commands that set a task value share a palette prefix', () => {
    for (const id of ['dueToday', 'dueTomorrow', 'clearDue', 'priorityHigh', 'priorityMedium', 'priorityLow', 'priorityNone']) {
      expect(COMMANDS.find((c) => c.id === id)?.palettePrefix).toBe('Set');
    }
  });
});

test('the command menu shows the menu key, else the list key', () => {
  const goTo = COMMANDS.find((c) => c.id === 'goToTask')!;
  expect(keyName(displayShortcut(goTo, false)!)).toBe('command+o');
  const open = COMMANDS.find((c) => c.id === 'openTask')!;
  expect(keyName(displayShortcut(open, false)!)).toBe('space');
  const today = COMMANDS.find((c) => c.id === 'dueToday')!;
  // ⌘T is the browser's, so the web has nothing to show.
  expect(displayShortcut(today, true)).toBeUndefined();
  expect(keyName({ input: 'down', modifiers: ['shift'] })).toBe('shift+down');
});

describe('formatShortcut', () => {
  test('draws Mac glyphs in menu order', () => {
    expect(formatShortcut({ input: '1', modifiers: ['command', 'option'] }, true)).toBe('⌥⌘1');
    expect(formatShortcut({ input: 'down', modifiers: ['shift'] }, true)).toBe('⇧↓');
    expect(formatShortcut({ input: 'delete', modifiers: ['command'] }, true)).toBe('⌘⌫');
    expect(formatShortcut({ input: 'k', modifiers: ['command'] }, true)).toBe('⌘K');
  });

  test('names keys away from a Mac, with Control for command', () => {
    expect(formatShortcut({ input: 'k', modifiers: ['command'] }, false)).toBe('Ctrl+K');
    expect(formatShortcut({ input: 'return', modifiers: ['command'] }, false)).toBe('Ctrl+Enter');
    expect(formatShortcut({ input: '1', modifiers: ['command', 'option'] }, false)).toBe('Ctrl+Alt+1');
  });
});

describe('matching DOM keys', () => {
  test('reads letters and digits from the physical key, which ⌥ changes the character of', () => {
    expect(keyInputOf(key('¡', 'Digit1', { altKey: true }))).toBe('1');
    expect(keyInputOf(key('K', 'KeyK', { shiftKey: true }))).toBe('k');
    expect(keyInputOf(key('ArrowDown', 'ArrowDown'))).toBe('down');
  });

  test('⌘ or Ctrl stands for command, but not both', () => {
    const shortcut = { input: 'k', modifiers: ['command' as const] };
    expect(matchesShortcut(shortcut, key('k', 'KeyK', { metaKey: true }))).toBe(true);
    expect(matchesShortcut(shortcut, key('k', 'KeyK', { ctrlKey: true }))).toBe(true);
    expect(matchesShortcut(shortcut, key('k', 'KeyK', { metaKey: true, ctrlKey: true }))).toBe(false);
    expect(matchesShortcut(shortcut, key('k', 'KeyK'))).toBe(false);
  });

  test('extra modifiers make a different shortcut', () => {
    expect(webCommandFor(key('ArrowDown', 'ArrowDown'))?.def.id).toBe('nextTask');
    expect(webCommandFor(key('ArrowDown', 'ArrowDown', { shiftKey: true }))?.def.id).toBe('selectNext');
    expect(webCommandFor(key('ArrowDown', 'ArrowDown', { metaKey: true }))?.def.id).toBe('lastTask');
    expect(webCommandFor(key('ArrowDown', 'ArrowDown', { altKey: true }))).toBeUndefined();
  });

  test('says whether a key was a plain list key, which a focused field keeps', () => {
    expect(webCommandFor(key('Enter', 'Enter'))).toMatchObject({ listKey: true });
    expect(webCommandFor(key('o', 'KeyO', { metaKey: true }))).toMatchObject({ listKey: false });
  });

  test('trashes on ⌘⌫ in the list only, and a plain Delete just names that key', () => {
    // A list key, so a text field keeps ⌘⌫ for deleting to the start of the line.
    expect(webCommandFor(key('Backspace', 'Backspace', { metaKey: true }))).toMatchObject({
      def: { id: 'deleteTask' },
      listKey: true,
    });
    expect(webCommandFor(key('Backspace', 'Backspace', { ctrlKey: true }))).toMatchObject({ def: { id: 'deleteTask' } });
    expect(COMMANDS.find((c) => c.id === 'deleteTask')!.shortcut).toBeUndefined();
    // The key reached for to fix a typo never trashes anything.
    expect(webCommandFor(key('Backspace', 'Backspace'))).toMatchObject({ def: { id: 'trashKeyHint' }, listKey: true });
    expect(LIST_KEYS.get('delete')).toBe('trashKeyHint');
    expect(LIST_KEYS.get('command+delete')).toBe('deleteTask');
  });

  test('leaves the browser its own keys', () => {
    // ⌘N and ⌘T open a window and a tab before a page hears them.
    expect(webCommandFor(key('n', 'KeyN', { metaKey: true }))).toBeUndefined();
    expect(webCommandFor(key('t', 'KeyT', { metaKey: true }))).toBeUndefined();
    expect(webCommandFor(key('k', 'KeyK', { metaKey: true }))?.def.id).toBe('commandMenu');
    // ⌘1–⌘9 switch the browser's tabs; the views are a Mac menu item there.
    expect(webCommandFor(key('1', 'Digit1', { metaKey: true }))).toBeUndefined();
    expect(COMMANDS.find((c) => c.id === 'goAll')!.shortcut).toEqual({ input: '1', modifiers: ['command'] });
  });

  test('Tab and Shift-Tab move round the panes from the list', () => {
    expect(webCommandFor(key('Tab', 'Tab'))).toMatchObject({ def: { id: 'nextPane' }, listKey: true });
    expect(webCommandFor(key('Tab', 'Tab', { shiftKey: true }))).toMatchObject({ def: { id: 'previousPane' }, listKey: true });
    expect(LIST_KEYS.get('tab')).toBe('nextPane');
    expect(LIST_KEYS.get('shift+tab')).toBe('previousPane');
  });
});

describe('switching views', () => {
  test('⌃Tab and ⌃⇧Tab step through the views, and ⇧⌘] ⇧⌘[ too', () => {
    expect(webCommandFor(key('Tab', 'Tab', { ctrlKey: true }))).toMatchObject({ def: { id: 'nextView' }, listKey: false });
    expect(webCommandFor(key('Tab', 'Tab', { ctrlKey: true, shiftKey: true }))?.def.id).toBe('previousView');
    expect(webCommandFor(key('}', 'BracketRight', { metaKey: true, shiftKey: true }))?.def.id).toBe('nextView');
    expect(webCommandFor(key('{', 'BracketLeft', { metaKey: true, shiftKey: true }))?.def.id).toBe('previousView');
    // Ctrl+Shift+] on Windows.
    expect(webCommandFor(key('}', 'BracketRight', { ctrlKey: true, shiftKey: true }))?.def.id).toBe('nextView');
    // ⌘Tab is the system's app switcher, and plain Tab moves between panes.
    expect(webCommandFor(key('Tab', 'Tab', { metaKey: true }))).toBeUndefined();
    expect(webCommandFor(key('Tab', 'Tab'))?.def.id).toBe('nextPane');
  });

  test('⌘[ and ⌘] go back and forward, and leave a field its own use of them', () => {
    expect(webCommandFor(key('[', 'BracketLeft', { metaKey: true }))).toMatchObject({ def: { id: 'goBack', yieldsToText: true } });
    expect(webCommandFor(key(']', 'BracketRight', { metaKey: true }))).toMatchObject({ def: { id: 'goForward', yieldsToText: true } });
    expect(webCommandFor(key('[', 'BracketLeft', { ctrlKey: true }))?.def.id).toBe('goBack');
  });

  test('are drawn as menus draw them', () => {
    const def = (id: string) => COMMANDS.find((c) => c.id === id)!;
    expect(menuKeys(def('nextView')).map((k) => formatShortcut(k, true))).toEqual(['⌃⇥', '⇧⌘]']);
    expect(menuKeys(def('previousView')).map((k) => formatShortcut(k, true))).toEqual(['⌃⇧⇥', '⇧⌘[']);
    expect(menuKeys(def('previousView')).map((k) => formatShortcut(k, false))).toEqual(['Ctrl+Shift+Tab', 'Ctrl+Shift+[']);
    expect(formatShortcut(def('goBack').shortcut!, true)).toBe('⌘[');
  });
});

describe('domKeyName', () => {
  test('names a DOM key as KeyCommandsView does', () => {
    expect(domKeyName(key('Tab', 'Tab', { shiftKey: true }))).toBe('shift+tab');
    expect(domKeyName(key('Escape', 'Escape'))).toBe('escape');
    expect(domKeyName(key(' ', 'Space'))).toBe('space');
    expect(domKeyName(key('PageDown', 'PageDown'))).toBe('pagedown');
    expect(domKeyName(key('ArrowUp', 'ArrowUp', { metaKey: true }))).toBe('command+up');
  });

  test('keeps Control and ⌘ apart, since neither is part of a plain key', () => {
    expect(domKeyName(key('Tab', 'Tab', { ctrlKey: true }))).toBe('control+tab');
    expect(domKeyName(key('Tab', 'Tab'))).toBe('tab');
  });
});

describe('the Keyboard shortcuts page', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const page = fs.readFileSync(path.join(__dirname, '../../docs/src/content/docs/using/keyboard.md'), 'utf8');

  test('lists every key a menu command has', () => {
    // The views are listed together, as ⌘1 to ⌘8.
    const views = new Set(['goAll', 'goInbox', 'goToday', 'goCalendar', 'goActivity', 'goBrowse', 'goTrash', 'goArchive']);
    const missing = COMMANDS.filter((c) => c.shortcut && !c.submenu && !views.has(c.id))
      .flatMap((c) => menuKeys(c).map((k) => formatShortcut(k, true)))
      .filter((glyphs) => !page.includes(glyphs));
    expect(missing).toEqual([]);
    expect(page).toContain('⌘1 to ⌘8');
  });
});

test('Group By and Sort By are named with their submenu in the command menu', () => {
  const titles = COMMANDS.filter((c) => c.submenu === 'Group By' || c.submenu === 'Sort By').map(paletteTitle);
  expect(titles).toContain('Group By: List');
  expect(titles).toContain('Sort By: Custom');
  // One for every option the Group & sort sheet offers.
  expect(titles).toHaveLength(10);
});

describe('vim keys', () => {
  test('are list keys', () => {
    expect(LIST_KEYS.get('j')).toBe('nextTask');
    expect(LIST_KEYS.get('k')).toBe('previousTask');
    expect(LIST_KEYS.get('g g')).toBe('firstTask');
    expect(LIST_KEYS.get('shift+g')).toBe('lastTask');
    expect(LIST_KEYS.get('}')).toBe('nextGroup');
    expect(LIST_KEYS.get('{')).toBe('previousGroup');
    expect(LIST_KEYS.get('control+e')).toBe('scrollLineDown');
    expect(LIST_KEYS.get('control+y')).toBe('scrollLineUp');
    expect(LIST_KEYS.get('z a')).toBe('toggleFold');
    expect(LIST_KEYS.get('z shift+m')).toBe('closeAllFolds');
    expect(LIST_KEYS.get('i')).toBe('newTask');
    expect(LIST_KEYS.get('o')).toBe('newTask');
    expect(LIST_KEYS.get('/')).toBe('find');
    expect(LIST_KEYS.get('\\')).toBe('toggleSidebar');
  });

  test('a list hears each half of a two-key one, and no prefix is a key of its own', () => {
    expect(LIST_KEY_NAMES).toEqual(expect.arrayContaining(['g', 'z', 'a', 'shift+r']));
    expect(LIST_KEY_NAMES).not.toContain('g g');
    expect(LIST_KEYS.has('g')).toBe(false);
    expect(LIST_KEYS.has('z')).toBe(false);
  });

  test('are drawn as vim writes them', () => {
    const def = (id: string) => COMMANDS.find((c) => c.id === id)!;
    expect(def('lastTask').listKeys!.map((k) => formatShortcut(k, true))).toEqual(['⌘↓', '↘', 'G']);
    expect(formatShortcut(def('firstTask').listKeys![2], false)).toBe('gg');
    expect(formatShortcut(def('nextTask').listKeys![1], true)).toBe('j');
    expect(formatShortcut(def('nextGroup').listKeys![0], true)).toBe('}');
    expect(formatShortcut(def('openAllFolds').listKeys![0], true)).toBe('zR');
    expect(formatShortcut(def('scrollLineDown').listKeys![0], true)).toBe('⌃E');
    expect(formatShortcut(def('scrollLineDown').listKeys![0], false)).toBe('Ctrl+E');
  });

  test('match the keys a browser reports', () => {
    expect(webCommandFor(key('j', 'KeyJ'))?.def.id).toBe('nextTask');
    expect(webCommandFor(key('G', 'KeyG', { shiftKey: true }))?.def.id).toBe('lastTask');
    expect(webCommandFor(key('g', 'KeyG'))).toBeUndefined();
    expect(webCommandFor(key('}', 'BracketRight', { shiftKey: true }))?.def.id).toBe('nextGroup');
    // Typed without ⇧ on another layout, it is still }.
    expect(webCommandFor(key('}', 'Digit0'))?.def.id).toBe('nextGroup');
    expect(webCommandFor(key('e', 'KeyE', { ctrlKey: true }))?.def.id).toBe('scrollLineDown');
    // ⌘E on a Mac is not ⌃E.
    expect(webCommandFor(key('e', 'KeyE', { metaKey: true }))).toBeUndefined();
  });
});

describe('createKeySequenceReader', () => {
  test('reads two keys as one', () => {
    const read = createKeySequenceReader();
    expect(read('g', 0)).toBe('pending');
    expect(read('g', 100)).toBe('firstTask');
    expect(read('z', 200)).toBe('pending');
    expect(read('shift+r', 300)).toBe('openAllFolds');
  });

  test('takes a key that finishes nothing on its own', () => {
    const read = createKeySequenceReader();
    expect(read('g', 0)).toBe('pending');
    expect(read('j', 100)).toBeUndefined();
    // The g was spent: one more doesn't make gg.
    expect(read('g', 200)).toBe('pending');
    expect(read('z', 300)).toBe('pending');
    expect(read('a', 400)).toBe('toggleFold');
    expect(read('j', 500)).toBeUndefined();
  });

  test('lets the first key go after a pause', () => {
    const read = createKeySequenceReader(1000);
    expect(read('g', 0)).toBe('pending');
    expect(read('g', 1500)).toBe('pending');
    expect(read('g', 1600)).toBe('firstTask');
  });
});

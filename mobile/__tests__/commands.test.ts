import {
  COMMANDS,
  KeyEventLike,
  formatShortcut,
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

  test('no two commands share a shortcut', () => {
    const shortcuts = COMMANDS.filter((c) => c.shortcut).map(
      (c) => `${[...c.shortcut!.modifiers].sort().join('+')}:${c.shortcut!.input}`
    );
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  test('a plain key only ever acts on the list, where a focused field takes it back', () => {
    for (const c of COMMANDS) {
      const plain = c.shortcut && !c.shortcut.modifiers.some((m) => m !== 'shift');
      if (plain) expect(c.list).toBe(true);
    }
  });

  test('a submenu item is named with its submenu in the palette', () => {
    const high = COMMANDS.find((c) => c.id === 'priorityHigh')!;
    expect(paletteTitle(high)).toBe('Priority: High');
    expect(paletteTitle(COMMANDS.find((c) => c.id === 'settings')!)).toBe('Settings');
  });
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
    expect(webCommandFor(key('ArrowDown', 'ArrowDown'))?.id).toBe('nextTask');
    expect(webCommandFor(key('ArrowDown', 'ArrowDown', { shiftKey: true }))?.id).toBe('selectNext');
    expect(webCommandFor(key('ArrowDown', 'ArrowDown', { metaKey: true }))).toBeUndefined();
  });

  test('leaves the browser its own keys', () => {
    // ⌘N and ⌘T open a window and a tab before a page hears them.
    expect(webCommandFor(key('n', 'KeyN', { metaKey: true }))).toBeUndefined();
    expect(webCommandFor(key('t', 'KeyT', { metaKey: true }))).toBeUndefined();
    expect(webCommandFor(key('k', 'KeyK', { metaKey: true }))?.id).toBe('commandMenu');
  });
});

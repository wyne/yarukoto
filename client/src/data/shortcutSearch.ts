import type { Modifier, Shortcut } from '../navigation/commands';

export interface ShortcutSearchRow {
  title: string;
  keys: string;
  searchTerms?: string;
}

export interface ShortcutSearchSection<T extends ShortcutSearchRow = ShortcutSearchRow> {
  title: string;
  rows: T[];
}

const MODIFIER_TERMS: Record<Modifier, string> = {
  command: 'command cmd control ctrl meta',
  option: 'option alt',
  shift: 'shift',
  control: 'control ctrl',
};

const INPUT_TERMS: Record<string, string> = {
  return: 'return enter',
  delete: 'delete backspace',
  escape: 'escape esc',
  space: 'space',
  tab: 'tab',
  up: 'up arrow',
  down: 'down arrow',
  left: 'left arrow',
  right: 'right arrow',
  home: 'home first',
  end: 'end last',
  pageup: 'page up',
  pagedown: 'page down',
  '/': 'slash',
  ',': 'comma',
};

/** Words people use to describe a shortcut, independent of how this platform draws it. */
export function shortcutSearchTerms(shortcuts: readonly Shortcut[]): string {
  return shortcuts
    .flatMap((shortcut) => [
      ...shortcut.modifiers.map((modifier) => MODIFIER_TERMS[modifier]),
      INPUT_TERMS[shortcut.input] ?? shortcut.input,
    ])
    .join(' ');
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\//g, ' slash ')
    .replace(/,/g, ' comma ')
    .replace(/[+–—-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Keeps the reference's section and row order while hiding everything that does not match. */
export function filterShortcutSections<T extends ShortcutSearchRow>(
  sections: readonly ShortcutSearchSection<T>[],
  query: string
): ShortcutSearchSection<T>[] {
  const wanted = tokens(query);
  if (wanted.length === 0) return sections.map((section) => ({ ...section, rows: [...section.rows] }));
  return sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) => {
        const haystack = tokens(`${section.title} ${row.title} ${row.keys} ${row.searchTerms ?? ''}`);
        return wanted.every((token) =>
          haystack.some((word) => (token.length === 1 ? word === token : word.includes(token)))
        );
      }),
    }))
    .filter((section) => section.rows.length > 0);
}

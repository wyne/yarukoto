import { filterShortcutSections, shortcutSearchTerms } from '../src/data/shortcutSearch';
import type { Shortcut } from '../src/navigation/commands';

const command: Shortcut = { input: 't', modifiers: ['command'] };
const tomorrow: Shortcut = { input: 't', modifiers: ['command', 'option'] };
const sections = [
  {
    title: 'Window',
    rows: [
      { title: 'Next pane or field', keys: 'Tab', searchTerms: shortcutSearchTerms([{ input: 'tab', modifiers: [] }]) },
      { title: 'Keyboard Shortcuts', keys: '⌘/', searchTerms: shortcutSearchTerms([{ input: '/', modifiers: ['command'] }]) },
    ],
  },
  {
    title: 'Task list',
    rows: [
      { title: 'Due Date: Today', keys: '⌘T', searchTerms: `date schedule ${shortcutSearchTerms([command])}` },
      { title: 'Due Date: Tomorrow', keys: '⌥⌘T', searchTerms: `date schedule ${shortcutSearchTerms([tomorrow])}` },
      { title: 'Mark as Done', keys: '⌘↩', searchTerms: shortcutSearchTerms([{ input: 'return', modifiers: ['command'] }]) },
    ],
  },
];

const titles = (query: string) => filterShortcutSections(sections, query).flatMap((section) => section.rows.map((row) => row.title));

test('matches command names, keywords, and section context', () => {
  expect(titles('tomorrow')).toEqual(['Due Date: Tomorrow']);
  expect(titles('schedule')).toEqual(['Due Date: Today', 'Due Date: Tomorrow']);
  expect(titles('task today')).toEqual(['Due Date: Today']);
});

test('matches normalized modifier and key names', () => {
  expect(titles('cmd t')).toEqual(['Due Date: Today', 'Due Date: Tomorrow']);
  expect(titles('option+command+t')).toEqual(['Due Date: Tomorrow']);
  expect(titles('ctrl enter')).toEqual(['Mark as Done']);
  expect(titles('cmd slash')).toEqual(['Keyboard Shortcuts']);
  expect(titles('⌘/')).toEqual(['Keyboard Shortcuts']);
});

test('keeps sections and rows in reference order and removes empty sections', () => {
  expect(filterShortcutSections(sections, 'due')).toEqual([{ title: 'Task list', rows: sections[1].rows.slice(0, 2) }]);
  expect(filterShortcutSections(sections, 'missing')).toEqual([]);
});

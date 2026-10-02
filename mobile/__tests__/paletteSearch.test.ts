import { rankPaletteItems } from '../src/data/paletteSearch';

const items = [
  { title: 'Mark as Done', keywords: 'complete check' },
  { title: 'Remove Due Date', keywords: 'date clear' },
  { title: 'Due Tomorrow', keywords: 'date snooze' },
  { title: 'Inbox' },
  { title: 'Find', keywords: 'search' },
  { title: 'Groceries' },
];
const titles = (query: string) => rankPaletteItems(items, query).map((i) => i.title);

test('an empty query keeps the given order', () => {
  expect(titles('')).toEqual(items.map((i) => i.title));
});

test('the start of a title beats the start of a word, which beats inside one', () => {
  expect(titles('in')).toEqual(['Inbox', 'Find']);
  expect(titles('due')).toEqual(['Due Tomorrow', 'Remove Due Date']);
});

test('every word has to match', () => {
  expect(titles('due tom')).toEqual(['Due Tomorrow']);
  expect(titles('due xyz')).toEqual([]);
});

test('keywords find a command after titles do', () => {
  expect(titles('complete')).toEqual(['Mark as Done']);
  expect(titles('date')).toEqual(['Remove Due Date', 'Due Tomorrow']);
});

test('case does not matter', () => {
  expect(titles('GROC')).toEqual(['Groceries']);
});

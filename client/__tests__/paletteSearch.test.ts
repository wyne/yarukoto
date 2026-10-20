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

test('visible prefixes are searchable without outranking the title', () => {
  const prefixed = [
    { title: 'Due Today', prefix: 'Set' },
    { title: 'Today', prefix: 'Go to' },
    { title: 'Inbox', prefix: 'Go to' },
  ];
  const found = (query: string) => rankPaletteItems(prefixed, query).map((i) => `${i.prefix} ${i.title}`);
  expect(found('go to')).toEqual(['Go to Today', 'Go to Inbox']);
  expect(found('set')).toEqual(['Set Due Today']);
  expect(found('today')).toEqual(['Go to Today', 'Set Due Today']);
});

test('case does not matter', () => {
  expect(titles('GROC')).toEqual(['Groceries']);
});

test('a place answers to its kind, so "tag" lists the tags', () => {
  const places = [
    { title: 'Sort By: Tag', keywords: 'order' },
    { title: '#work', keywords: 'tag work' },
    { title: '#home', keywords: 'tag home' },
    { title: 'Groceries', keywords: 'list' },
  ];
  const found = (query: string) => rankPaletteItems(places, query).map((i) => i.title);
  expect(found('tag')).toEqual(['Sort By: Tag', '#work', '#home']);
  expect(found('tag wo')).toEqual(['#work']);
});

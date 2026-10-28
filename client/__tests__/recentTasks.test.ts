import {
  DWELL_MS,
  RECENT_LIMIT,
  SWITCHER_CLOSED,
  noteSwitchedTo,
  recentTaskIds,
  resetRecentTasks,
  stepSwitcher,
  switcherList,
  taskOpened,
  withRecent,
} from '../src/navigation/recentTasks';

const live = () => true;

describe('the switcher list', () => {
  test('puts the open task first, then the rest by recency', () => {
    expect(switcherList('c', ['a', 'b', 'c'], live)).toEqual(['c', 'a', 'b']);
    expect(switcherList(null, ['a', 'b'], live)).toEqual(['a', 'b']);
  });

  test('leaves out tasks that are gone or done', () => {
    expect(switcherList('a', ['b', 'c', 'd'], (id) => id !== 'c')).toEqual(['a', 'b', 'd']);
  });

  test('holds ten tasks', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `t${i}`);
    expect(RECENT_LIMIT).toBe(10);
    expect(switcherList('x', ids, live)).toHaveLength(10);
    expect(ids.reduce((r, id) => withRecent(r, id), [] as string[])).toEqual(ids.slice(5).reverse());
  });
});

describe('stepping', () => {
  const list = ['open', 'b', 'c', 'd'];

  test('the first ⌃Tab chooses the task before the open one', () => {
    expect(stepSwitcher(SWITCHER_CLOSED, 1, list, 'open')).toEqual({ list, index: 1 });
  });

  test('more Tabs move down and round; ⌃⇧Tab moves up', () => {
    let state = stepSwitcher(SWITCHER_CLOSED, 1, list, 'open');
    state = stepSwitcher(state, 1, [], 'open');
    state = stepSwitcher(state, 1, [], 'open');
    expect(state.index).toBe(3);
    state = stepSwitcher(state, 1, [], 'open');
    expect(state.index).toBe(0);
    state = stepSwitcher(state, -1, [], 'open');
    expect(state.index).toBe(3);
  });

  test('going backwards first chooses the last task', () => {
    expect(stepSwitcher(SWITCHER_CLOSED, -1, list, 'open').index).toBe(3);
  });

  test('with nothing open, the first ⌃Tab chooses the most recent task', () => {
    expect(stepSwitcher(SWITCHER_CLOSED, 1, ['a', 'b'], null).index).toBe(0);
  });

  test('with only the open task, it stays on it; with nothing at all, nothing opens', () => {
    expect(stepSwitcher(SWITCHER_CLOSED, 1, ['open'], 'open')).toEqual({ list: ['open'], index: 0 });
    expect(stepSwitcher(SWITCHER_CLOSED, 1, [], null)).toBe(SWITCHER_CLOSED);
  });
});

describe('what counts as recent', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetRecentTasks();
  });
  afterEach(() => jest.useRealTimers());

  test('a task open for a moment, but not one passed on the way to another', () => {
    taskOpened('a');
    jest.advanceTimersByTime(DWELL_MS);
    taskOpened('b');
    jest.advanceTimersByTime(100);
    taskOpened('c');
    jest.advanceTimersByTime(DWELL_MS);
    expect(recentTaskIds()).toEqual(['c', 'a']);
  });

  test('a task gone to with the switcher, at once', () => {
    taskOpened('a');
    jest.advanceTimersByTime(DWELL_MS);
    noteSwitchedTo('b');
    taskOpened('b');
    expect(recentTaskIds()).toEqual(['b', 'a']);
  });
});

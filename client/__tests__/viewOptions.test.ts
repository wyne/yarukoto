import {
  arrangementFor,
  arrangementFrom,
  dateBucket,
  dayGroupKey,
  groupByDay,
  groupDropPatch,
  INBOX_GROUP_KEY,
  UNTAGGED_KEY,
  DEFAULT_VIEW_OPTIONS,
  groupTasks,
  hasArrangement,
  LATER_REPEATS_KEY,
  laterRepeatsGroup,
  splitLaterRepeats,
  sortLabel,
  sortTasks,
  UNGROUPED_KEY,
  ViewOptions,
  viewKey,
  viewOptionsFor,
} from '../src/data/viewOptions';
import { folder, list, task } from '../test/fixtures';

const now = new Date(2026, 8, 27, 12);

function options(overrides: Partial<ViewOptions>): ViewOptions {
  return { ...DEFAULT_VIEW_OPTIONS, ...overrides };
}

describe('saved view options', () => {
  test('builds stable keys and falls back for missing or deleted preferences', () => {
    expect(viewKey('inbox')).toBe('inbox');
    expect(viewKey('inbox', { type: 'tag', value: 'dev' })).toBe('inbox:tag:dev');
    expect(viewOptionsFor([], 'inbox')).toBe(DEFAULT_VIEW_OPTIONS);
    expect(viewOptionsFor([
      { id: 'inbox', groupBy: 'tag', sortBy: 'title', updatedAt: 'now', deletedAt: 'later' },
    ], 'inbox')).toBe(DEFAULT_VIEW_OPTIONS);
    expect(viewOptionsFor([
      { id: 'inbox', groupBy: 'list', sortBy: 'date', updatedAt: 'now' },
    ], 'inbox')).toEqual({ groupBy: 'list', sortBy: 'date', arrangements: {} });
    expect(sortLabel('manual')).toBe('Custom');
  });

  test('stores and discovers manual arrangements', () => {
    const arrangements = { title: { all: arrangementFrom(['b', 'a']) } };
    expect(arrangements.title.all).toEqual({ b: 0, a: 1024 });
    expect(arrangementFor(arrangements, 'title', 'all')).toEqual({ b: 0, a: 1024 });
    expect(arrangementFor({ title: { all: {} } }, 'title', 'all')).toBeUndefined();
    expect(hasArrangement(arrangements, 'title')).toBe(true);
    expect(hasArrangement(arrangements, 'date')).toBe(false);
  });
});

describe('task sorting and grouping', () => {
  const tasks = [
    task('zebra', { title: 'zebra', dueDate: '2026-09-28', tags: [], priority: 'none', order: 1 }),
    task('alpha', { title: 'Alpha', dueDate: '2026-09-27', dueTime: '18:00', tags: ['zoo'], priority: 'low', order: 4 }),
    task('beta', { title: 'beta', dueDate: '2026-09-27', dueTime: '09:00', tags: ['Dev', 'alpha'], priority: 'high', order: 3 }),
    task('same-title', { title: 'alpha', tags: ['beta'], priority: 'medium', order: 2 }),
  ];

  test.each([
    ['manual', ['zebra', 'same-title', 'beta', 'alpha']],
    ['date', ['beta', 'alpha', 'zebra', 'same-title']],
    ['title', ['same-title', 'alpha', 'beta', 'zebra']],
    ['tag', ['same-title', 'beta', 'alpha', 'zebra']],
    ['priority', ['beta', 'same-title', 'alpha', 'zebra']],
  ] as const)('sorts tasks by %s', (sortBy, expected) => {
    expect(sortTasks(tasks, options({ sortBy })).map((item) => item.id)).toEqual(expected);
  });

  test('uses a group arrangement and leads with newly matching tasks', () => {
    const arranged = options({
      sortBy: 'title',
      arrangements: { title: { [UNGROUPED_KEY]: { alpha: 0, beta: 1024 } } },
    });
    expect(sortTasks(tasks, arranged).map((item) => item.id)).toEqual([
      'same-title',
      'zebra',
      'alpha',
      'beta',
    ]);
  });

  test('classifies every date bucket', () => {
    const buckets = [
      task('none'),
      task('past', { dueDate: '2026-09-26' }),
      task('today', { dueDate: '2026-09-27' }),
      task('tomorrow', { dueDate: '2026-09-28' }),
      task('week', { dueDate: '2026-10-04' }),
      task('later', { dueDate: '2026-10-05' }),
    ].map((item) => dateBucket(item, now).key);
    expect(buckets).toEqual(['nodate', 'overdue', 'today', 'tomorrow', 'week', 'later']);
  });

  test('groups lists in navigation order with Inbox first', () => {
    const lists = [
      list('root', { name: 'Root', order: 3 }),
      list('nested', { name: 'Nested', folderId: 'work', order: 0, color: '#123456' }),
    ];
    const folders = [folder('work', { order: 1 })];
    const grouped = groupTasks([
      task('root-task', { listId: 'root' }),
      task('nested-task', { listId: 'nested' }),
      task('inbox-task'),
    ], options({ groupBy: 'list' }), { lists, folders, now });

    expect(grouped.map((group) => [group.key, group.label, group.color])).toEqual([
      ['__inbox', 'Inbox', undefined],
      ['nested', 'Nested', '#123456'],
      ['root', 'Root', '#888888'],
    ]);
  });

  test('groups and orders dates, tags, and priorities', () => {
    const dated = [
      task('none'),
      task('future', { dueDate: '2026-10-10' }),
      task('past', { dueDate: '2026-09-20' }),
    ];
    expect(groupTasks(dated, options({ groupBy: 'date' }), { lists: [], folders: [], now })
      .map((group) => group.key)).toEqual(['overdue', 'later', 'nodate']);

    const tagged = [task('none'), task('multi', { tags: ['zoo', 'alpha'] })];
    expect(groupTasks(tagged, options({ groupBy: 'tag' }), { lists: [], folders: [], now })
      .map((group) => group.key)).toEqual(['tag:alpha', 'tag:zoo', '__untagged']);

    expect(groupTasks(tasks, options({ groupBy: 'priority' }), { lists: [], folders: [], now })
      .map((group) => group.key)).toEqual(['p:high', 'p:medium', 'p:low', 'p:none']);
  });

  test('keeps an ungrouped view as one sorted group', () => {
    const grouped = groupTasks(tasks, options({ sortBy: 'date' }), { lists: [], folders: [], now });
    expect(grouped).toHaveLength(1);
    expect(grouped[0].key).toBe(UNGROUPED_KEY);
    expect(grouped[0].tasks.map((item) => item.id)).toEqual(['beta', 'alpha', 'zebra', 'same-title']);
  });
});

describe('Today by day', () => {
  // A Saturday; the clocks go back in New York overnight into Sunday.
  const saturday = new Date(2026, 9, 31, 12);

  test('gives every day a group, overdue in today, empty days kept', () => {
    const tasks = [
      task('late', { dueDate: '2026-10-29', order: 2 }),
      task('today', { dueDate: '2026-10-31', order: 1 }),
      task('monday', { dueDate: '2026-11-02', order: 1 }),
      task('beyond', { dueDate: '2026-11-03' }),
      task('undated'),
    ];
    const groups = groupByDay(tasks, DEFAULT_VIEW_OPTIONS, saturday, 3);
    expect(groups.map((g) => [g.key, g.label, g.tasks.map((t) => t.id)])).toEqual([
      [UNGROUPED_KEY, 'Today', ['today', 'late']],
      ['day:1', 'Tomorrow', []],
      ['day:2', 'Mon Nov 2', ['monday']],
    ]);
  });

  test('keys today like an ungrouped view so its arrangement carries over', () => {
    expect(dayGroupKey(0)).toBe(UNGROUPED_KEY);
    const tasks = [task('a', { dueDate: '2026-10-31' }), task('b', { dueDate: '2026-10-31' })];
    const arranged = options({ sortBy: 'title', arrangements: { title: { [UNGROUPED_KEY]: arrangementFrom(['b', 'a']) } } });
    expect(groupByDay(tasks, arranged, saturday, 2)[0].tasks.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('far-off repeats', () => {
  const yearly = { rule: 'FREQ=YEARLY;INTERVAL=1', from: 'due' as const };

  test('sets aside only repeating tasks due more than two weeks out, soonest first', () => {
    const tasks = [
      task('tax', { dueDate: '2027-04-15', repeat: yearly }),
      task('edge', { dueDate: '2026-10-11', repeat: yearly }),
      task('renew', { dueDate: '2026-12-01', repeat: yearly }),
      task('oneoff', { dueDate: '2027-06-01' }),
      task('undated'),
    ];
    const { soon, later } = splitLaterRepeats(tasks, now);
    expect(soon.map((t) => t.id)).toEqual(['edge', 'oneoff', 'undated']);
    expect(later.map((t) => t.id)).toEqual(['renew', 'tax']);
  });

  test('builds a headed group only when there is something in it', () => {
    expect(laterRepeatsGroup([])).toEqual([]);
    const [group] = laterRepeatsGroup([task('a', { dueDate: '2027-01-01', repeat: yearly })]);
    expect(group).toMatchObject({ key: LATER_REPEATS_KEY, headed: true });
  });
});

describe('groupDropPatch', () => {
  const at = new Date(2026, 8, 27, 12);
  const t = task('t', { tags: ['dev', 'docs'], dueDate: '2026-09-20', dueTime: '09:00' });

  it('moves a task to the list it lands in, or out of every list into Inbox', () => {
    expect(groupDropPatch(t, INBOX_GROUP_KEY, 'l_home', 'list', at)).toEqual({ listId: 'l_home' });
    expect(groupDropPatch(t, 'l_home', INBOX_GROUP_KEY, 'list', at)).toEqual({ listId: null });
  });

  it('sets the priority of the group', () => {
    expect(groupDropPatch(t, 'p:none', 'p:high', 'priority', at)).toEqual({ priority: 'high' });
  });

  it('dates a task only into groups that stand for one day', () => {
    expect(groupDropPatch(t, 'overdue', 'today', 'date', at)).toEqual({ dueDate: '2026-09-27' });
    expect(groupDropPatch(t, 'overdue', 'tomorrow', 'date', at)).toEqual({ dueDate: '2026-09-28' });
    expect(groupDropPatch(t, 'overdue', 'nodate', 'date', at)).toEqual({ dueDate: undefined, dueTime: undefined });
    // Clearing the date would take these with it, which a drop gives no sign of.
    const repeating = task('r', { dueDate: '2026-09-27', repeat: { rule: 'FREQ=WEEKLY', from: 'due' } });
    const reminded = task('m', { dueDate: '2026-09-27', reminders: [{ id: 'x', offsetDays: 0, time: '09:00' }] });
    expect(groupDropPatch(repeating, 'today', 'nodate', 'date', at)).toBeNull();
    expect(groupDropPatch(reminded, 'today', 'nodate', 'date', at)).toBeNull();
    expect(groupDropPatch(repeating, 'today', 'tomorrow', 'date', at)).toEqual({ dueDate: '2026-09-28' });
    for (const range of ['overdue', 'week', 'later']) {
      expect(groupDropPatch(t, 'today', range, 'date', at)).toBeNull();
    }
  });

  it('dates a task to the day section it lands in', () => {
    expect(groupDropPatch(t, dayGroupKey(0), dayGroupKey(3), 'day', at)).toEqual({ dueDate: '2026-09-30' });
    expect(groupDropPatch(t, dayGroupKey(2), dayGroupKey(0), 'day', at)).toEqual({ dueDate: '2026-09-27' });
  });

  it('swaps the tag the row was under for the one it lands under, keeping the rest', () => {
    expect(groupDropPatch(t, 'tag:dev', 'tag:home', 'tag', at)).toEqual({ tags: ['docs', 'home'] });
    expect(groupDropPatch(t, 'tag:dev', 'tag:docs', 'tag', at)).toEqual({ tags: ['docs'] });
    expect(groupDropPatch(t, 'tag:dev', UNTAGGED_KEY, 'tag', at)).toEqual({ tags: ['docs'] });
    expect(groupDropPatch(task('u'), UNTAGGED_KEY, 'tag:home', 'tag', at)).toEqual({ tags: ['home'] });
  });

  it('turns away Upcoming repeats, ungrouped views and drops onto the same group', () => {
    expect(groupDropPatch(t, LATER_REPEATS_KEY, 'p:high', 'priority', at)).toBeNull();
    expect(groupDropPatch(t, 'p:high', LATER_REPEATS_KEY, 'priority', at)).toBeNull();
    expect(groupDropPatch(t, UNGROUPED_KEY, LATER_REPEATS_KEY, 'none', at)).toBeNull();
    expect(groupDropPatch(t, 'p:high', 'p:high', 'priority', at)).toBeNull();
  });
});

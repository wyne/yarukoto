import {
  arrangementFor,
  arrangementFrom,
  dateBucket,
  DEFAULT_VIEW_OPTIONS,
  groupTasks,
  hasArrangement,
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

import {
  EMPTY_CRITERIA,
  filterTasks,
  INBOX_LIST_ID,
  isEmptyCriteria,
  taskMatcher,
  TaskCriteria,
} from '../src/data/taskFilter';
import { list, task } from '../test/fixtures';

const now = new Date(2026, 8, 27, 12);
const lists = [
  list('work', { folderId: 'office' }),
  list('admin', { folderId: 'office' }),
  list('home'),
  list('deleted', { deletedAt: '2026-09-01T00:00:00Z' }),
];
const tasks = [
  task('overdue', {
    title: 'Submit expense report',
    dueDate: '2026-09-20',
    listId: 'work',
    tags: ['finance'],
    order: 4,
  }),
  task('today', { title: 'Plan launch', dueDate: '2026-09-27', listId: 'admin', tags: ['dev'], order: 2 }),
  task('tomorrow', { dueDate: '2026-09-28', listId: 'home', tags: ['home'], order: 1 }),
  task('week', { dueDate: '2026-10-03', listId: 'work', tags: ['dev'], order: 5 }),
  task('later', { dueDate: '2026-10-10', listId: 'work', tags: ['finance'], order: 6 }),
  task('inbox', { title: 'Loose thought', order: 3 }),
  task('done', { completed: true, dueDate: '2026-09-27', listId: 'work', order: 0 }),
  task('trashed', { deletedAt: '2026-09-01T00:00:00Z', listId: 'work' }),
];

function criteria(overrides: Partial<TaskCriteria>): TaskCriteria {
  return { ...EMPTY_CRITERIA, ...overrides };
}

describe('task filtering', () => {
  test('matches visible title or tag text case-insensitively', () => {
    expect(taskMatcher(' EXPENSE ')(tasks[0])).toBe(true);
    expect(taskMatcher('FIN')(tasks[0])).toBe(true);
    expect(taskMatcher('missing')(tasks[0])).toBe(false);
    expect(taskMatcher('')(tasks[0])).toBe(true);
  });

  test('recognises only the untouched active criteria as empty', () => {
    expect(isEmptyCriteria(EMPTY_CRITERIA)).toBe(true);
    expect(isEmptyCriteria(criteria({ query: '  ' }))).toBe(true);
    expect(isEmptyCriteria(criteria({ tags: ['dev'] }))).toBe(false);
    expect(isEmptyCriteria(criteria({ status: 'any' }))).toBe(false);
  });

  test('ANDs dimensions while ORing choices within one dimension', () => {
    const result = filterTasks(
      tasks,
      criteria({ folderIds: ['office'], tags: ['dev', 'finance'], due: ['today', 'week'] }),
      { lists, now }
    );

    expect(result.map((item) => item.id)).toEqual(['today', 'week']);
  });

  test('supports inbox, completed, and any-status searches while always excluding trash', () => {
    expect(filterTasks(tasks, criteria({ listIds: [INBOX_LIST_ID] }), { lists, now }).map((t) => t.id))
      .toEqual(['inbox']);
    expect(filterTasks(tasks, criteria({ status: 'completed' }), { lists, now }).map((t) => t.id))
      .toEqual(['done']);
    expect(filterTasks(tasks, criteria({ status: 'any', query: 'launch' }), { lists, now }).map((t) => t.id))
      .toEqual(['today']);
  });

  test('ignores stale list selections instead of producing an unexplained empty view', () => {
    const result = filterTasks(tasks, criteria({ listIds: ['missing', 'deleted'] }), { lists, now });
    expect(result.map((item) => item.id)).toEqual([
      'tomorrow',
      'today',
      'inbox',
      'overdue',
      'week',
      'later',
    ]);
  });

  test.each([
    ['overdue', ['overdue']],
    ['today', ['today']],
    ['week', ['tomorrow', 'today', 'week']],
    ['later', ['later']],
    ['nodate', ['inbox']],
  ] as const)('filters the %s due-date range', (due, expected) => {
    expect(filterTasks(tasks, criteria({ due: [due] }), { lists, now }).map((t) => t.id))
      .toEqual(expected);
  });
});

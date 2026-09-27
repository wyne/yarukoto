import {
  activeFolders,
  activeLists,
  activeTasks,
  completedInboxTasks,
  completedTasksList,
  folderTotal,
  getListById,
  inboxCount,
  inboxTasks,
  listCounts,
  listsInFolder,
  navGroups,
  orderedLists,
  tagCounts,
  tasksByDate,
  tasksDueByToday,
  tasksUpcomingCount,
  trashedTasks,
  unscheduledTasks,
} from '../src/data/selectors';
import { folder, list, task } from '../test/fixtures';

describe('list and folder selectors', () => {
  const folders = [
    folder('later', { order: 4 }),
    folder('work', { order: 1 }),
    folder('deleted', { order: 0, deletedAt: '2026-09-01T00:00:00Z' }),
  ];
  const lists = [
    list('personal', { order: 3 }),
    list('work-b', { folderId: 'work', order: 2 }),
    list('work-a', { folderId: 'work', order: 1 }),
    list('first', { order: 0 }),
    list('deleted-list', { order: -1, deletedAt: '2026-09-01T00:00:00Z' }),
  ];

  test('excludes deleted rows and orders stable navigation groups', () => {
    expect(activeFolders(folders).map((item) => item.id)).toEqual(['work', 'later']);
    expect(activeLists(lists).map((item) => item.id)).toEqual([
      'first',
      'work-a',
      'work-b',
      'personal',
    ]);
    expect(navGroups(lists, folders).map((group) => ({
      folder: group.folder?.id ?? null,
      lists: group.lists.map((item) => item.id),
    }))).toEqual([
      { folder: null, lists: ['first'] },
      { folder: 'work', lists: ['work-a', 'work-b'] },
      { folder: null, lists: ['personal'] },
      { folder: 'later', lists: [] },
    ]);
    expect(orderedLists(lists, folders).map((item) => item.id)).toEqual([
      'first',
      'work-a',
      'work-b',
      'personal',
    ]);
  });

  test('looks up only live lists and scopes lists to their folder', () => {
    expect(getListById(lists, null)).toBeUndefined();
    expect(getListById(lists, 'deleted-list')).toBeUndefined();
    expect(getListById(lists, 'work-a')?.name).toBe('work-a');
    expect(listsInFolder(lists, 'work').map((item) => item.id)).toEqual(['work-a', 'work-b']);
    expect(folderTotal(lists, { 'work-a': 2, 'work-b': 3 }, 'work')).toBe(5);
  });
});

describe('task selectors', () => {
  const now = new Date(2026, 8, 27, 12);
  const tasks = [
    task('future', { dueDate: '2026-09-28', listId: 'work', tags: ['dev'], order: 5 }),
    task('inbox', { tags: ['home'], order: 2 }),
    task('today', { dueDate: '2026-09-27', listId: 'work', tags: ['dev'], order: 1 }),
    task('overdue', { dueDate: '2026-09-20', listId: 'home', order: 4 }),
    task('completed-inbox', { completed: true, order: 3 }),
    task('completed-list', { completed: true, listId: 'work', order: 8 }),
    task('trashed-old', { deletedAt: '2026-09-01T00:00:00Z', order: 0 }),
    task('trashed-new', { deletedAt: '2026-09-20T00:00:00Z', order: 9 }),
  ];

  test('splits active, completed, inbox, unscheduled, and trash views', () => {
    expect(activeTasks(tasks).map((item) => item.id)).toEqual([
      'today',
      'inbox',
      'overdue',
      'future',
    ]);
    expect(completedTasksList(tasks).map((item) => item.id)).toEqual([
      'completed-inbox',
      'completed-list',
    ]);
    expect(inboxTasks(tasks).map((item) => item.id)).toEqual(['inbox']);
    expect(completedInboxTasks(tasks).map((item) => item.id)).toEqual(['completed-inbox']);
    expect(unscheduledTasks(tasks).map((item) => item.id)).toEqual(['inbox']);
    expect(trashedTasks(tasks).map((item) => item.id)).toEqual(['trashed-new', 'trashed-old']);
  });

  test('counts only active tasks and includes overdue work in Today', () => {
    expect(listCounts(tasks)).toEqual({ work: 2, home: 1 });
    expect(tagCounts(tasks)).toEqual([
      { tag: 'dev', count: 2 },
      { tag: 'home', count: 1 },
    ]);
    expect(inboxCount(tasks)).toBe(1);
    expect(tasksDueByToday(tasks, now).map((item) => item.id)).toEqual(['today', 'overdue']);
    expect(tasksUpcomingCount(tasks, now)).toBe(1);
  });

  test('groups dated tasks with timed work first and completed work optional', () => {
    const dated = [
      task('all-day-later', { dueDate: '2026-09-27', order: 5 }),
      task('late', { dueDate: '2026-09-27', dueTime: '17:00', order: 1 }),
      task('early', { dueDate: '2026-09-27', dueTime: '09:00', order: 4 }),
      task('all-day-first', { dueDate: '2026-09-27', order: 2 }),
      task('done', { dueDate: '2026-09-28', completed: true }),
      task('deleted', { dueDate: '2026-09-29', deletedAt: '2026-09-01T00:00:00Z' }),
      task('undated'),
    ];

    expect(tasksByDate(dated).get('2026-09-27')?.map((item) => item.id)).toEqual([
      'early',
      'late',
      'all-day-first',
      'all-day-later',
    ]);
    expect(tasksByDate(dated).has('2026-09-28')).toBe(false);
    expect(tasksByDate(dated, true).get('2026-09-28')?.[0].id).toBe('done');
  });
});

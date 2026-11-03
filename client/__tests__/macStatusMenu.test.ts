import { statusMenuContents } from '../src/data/macStatusMenu';
import { task } from '../test/fixtures';

describe('statusMenuContents', () => {
  const now = new Date(2026, 9, 18, 9, 30);

  const tasks = [
    task('later', { dueDate: '2026-10-19' }),
    task('today-untimed', { dueDate: '2026-10-18', order: 1 }),
    task('today-late', { dueDate: '2026-10-18', dueTime: '17:00', order: 2 }),
    task('today-early', { dueDate: '2026-10-18', dueTime: '08:00', order: 3 }),
    task('overdue-recent', { dueDate: '2026-10-16', order: 1 }),
    task('overdue-old', { dueDate: '2026-10-12', order: 9 }),
    task('done', { dueDate: '2026-10-18', completed: true }),
    task('undated'),
  ];

  test('lists Overdue, oldest first, then Today by time and order', () => {
    const { sections } = statusMenuContents(tasks, now, 'today');
    expect(sections.map((s) => [s.overdue, s.total, s.tasks.map((t) => t.id), s.more])).toEqual([
      [true, 2, ['overdue-old', 'overdue-recent'], 0],
      [false, 3, ['today-early', 'today-late', 'today-untimed'], 0],
    ]);
  });

  test('counts what the Badge count setting asks for', () => {
    expect(statusMenuContents(tasks, now, 'today').count).toBe(5);
    expect(statusMenuContents(tasks, now, 'overdue').count).toBe(2);
    expect(statusMenuContents(tasks, now, 'off').count).toBe(0);
  });

  test('leaves out an empty section, and keeps an empty Today when nothing is due', () => {
    const overdueOnly = statusMenuContents([task('o', { dueDate: '2026-10-01' })], now, 'today');
    expect(overdueOnly.sections.map((s) => s.overdue)).toEqual([true]);

    const nothing = statusMenuContents([task('later', { dueDate: '2026-10-20' })], now, 'today');
    expect(nothing.sections).toEqual([{ overdue: false, total: 0, tasks: [], more: 0 }]);
    expect(nothing.count).toBe(0);
  });

  test('splits the limit so a long overdue backlog leaves room for today', () => {
    const many = [
      ...Array.from({ length: 6 }, (_, i) => task(`o${i}`, { dueDate: '2026-10-10', order: i })),
      ...Array.from({ length: 6 }, (_, i) => task(`t${i}`, { dueDate: '2026-10-18', order: i })),
    ];
    const { sections } = statusMenuContents(many, now, 'today', 4);
    expect(sections.map((s) => [s.tasks.map((t) => t.id), s.more, s.total])).toEqual([
      [['o0', 'o1'], 4, 6],
      [['t0', 't1'], 4, 6],
    ]);
  });

  test('gives a section the rows the other does not use', () => {
    const many = [
      ...Array.from({ length: 5 }, (_, i) => task(`o${i}`, { dueDate: '2026-10-10', order: i })),
      task('t0', { dueDate: '2026-10-18' }),
    ];
    const { sections } = statusMenuContents(many, now, 'today', 4);
    expect(sections.map((s) => [s.tasks.map((t) => t.id), s.more])).toEqual([
      [['o0', 'o1', 'o2'], 2],
      [['t0'], 0],
    ]);
  });
});

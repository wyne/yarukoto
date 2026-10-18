import { statusMenuContents } from '../src/data/macStatusMenu';
import { task } from '../test/fixtures';

describe('statusMenuContents', () => {
  const now = new Date(2026, 9, 18, 9, 30);

  test('lists what Today shows, overdue first, then by time and order', () => {
    const contents = statusMenuContents(
      [
        task('later', { dueDate: '2026-10-19' }),
        task('today-untimed', { dueDate: '2026-10-18', order: 1 }),
        task('today-late', { dueDate: '2026-10-18', dueTime: '17:00', order: 2 }),
        task('today-early', { dueDate: '2026-10-18', dueTime: '08:00', order: 3 }),
        task('overdue', { dueDate: '2026-10-12', order: 9 }),
        task('done', { dueDate: '2026-10-18', completed: true }),
        task('undated'),
      ],
      now
    );
    expect(contents.tasks.map((t) => [t.id, t.overdue])).toEqual([
      ['overdue', true],
      ['today-early', false],
      ['today-late', false],
      ['today-untimed', false],
    ]);
    expect(contents.more).toBe(0);
    expect(contents.count).toBe(4);
  });

  test('stops at the limit and counts the rest', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => task(`t${i}`, { dueDate: '2026-10-18', order: i }));
    const contents = statusMenuContents(tasks, now, 3);
    expect(contents.tasks.map((t) => t.id)).toEqual(['t0', 't1', 't2']);
    expect(contents.more).toBe(2);
    expect(contents.count).toBe(5);
  });
});

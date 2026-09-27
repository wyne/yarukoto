import { parseQuickAdd } from '../src/data/quickAdd';

describe('quick add parser', () => {
  const now = new Date(2026, 8, 27, 12);

  test('extracts date, time, tags, priority, and list tokens', () => {
    expect(parseQuickAdd('Pay rent fri 6pm #Home !high ~Admin', now)).toEqual({
      title: 'Pay rent',
      priority: 'high',
      dueDate: '2026-10-02',
      dueTime: '18:00',
      tags: ['home'],
      listName: 'Admin',
    });
  });

  test('supports tomorrow shorthand and 24-hour times', () => {
    expect(parseQuickAdd('Call dentist tmrw 09:30 !m', now)).toEqual({
      title: 'Call dentist',
      priority: 'medium',
      dueDate: '2026-09-28',
      dueTime: '09:30',
      tags: [],
      listName: undefined,
    });
  });

  test('keeps a time-looking token in the title without a due date', () => {
    expect(parseQuickAdd('Review 6pm draft', now).title).toBe('Review 6pm draft');
  });
});

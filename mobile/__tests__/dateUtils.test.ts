import {
  addDays,
  buildMonthGrid,
  formatDueShort,
  toISODate,
} from '../src/data/dateUtils';

describe('date utilities', () => {
  test('adds calendar days across the daylight-saving fallback', () => {
    const saturday = new Date(2026, 9, 31, 12);

    expect(toISODate(addDays(saturday, 1))).toBe('2026-11-01');
    expect(toISODate(addDays(saturday, 2))).toBe('2026-11-02');
  });

  test('builds a six-week grid with one entry per calendar day', () => {
    const cells = buildMonthGrid(new Date(2026, 10, 15));
    const dates = cells.map(({ date }) => toISODate(date));

    expect(cells).toHaveLength(42);
    expect(new Set(dates).size).toBe(42);
    expect(dates[0]).toBe('2026-11-01');
    expect(dates.at(-1)).toBe('2026-12-12');
    expect(cells.filter(({ inMonth }) => inMonth)).toHaveLength(30);
  });

  test('uses relative labels only for nearby due dates', () => {
    const now = new Date(2026, 8, 27, 16, 30);

    expect(formatDueShort(now, '2026-09-26')).toBe('Yesterday');
    expect(formatDueShort(now, '2026-09-27', '18:00')).toBe('Today 6:00 PM');
    expect(formatDueShort(now, '2026-09-28')).toBe('Tomorrow');
    expect(formatDueShort(now, '2026-10-10')).toBe('Oct 10');
  });
});

import {
  addDays,
  addMonths,
  addWeeks,
  buildMonthGrid,
  dayRangeLabel,
  elapsedShort,
  formatDueFull,
  formatDueShort,
  formatTime24to12,
  fromISODate,
  isBeforeDay,
  isOverdue,
  isSameDay,
  lastSyncedLabel,
  monthShort,
  startOfDay,
  startOfWeek,
  toISODate,
  weekdayShort,
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

  test('performs local calendar arithmetic and comparisons', () => {
    const date = new Date(2026, 8, 30, 18, 45);
    expect(startOfDay(date)).toEqual(new Date(2026, 8, 30));
    expect(toISODate(fromISODate('2026-09-30'))).toBe('2026-09-30');
    expect(toISODate(addMonths(date, 1))).toBe('2026-10-01');
    expect(toISODate(addWeeks(date, 2))).toBe('2026-10-14');
    expect(toISODate(startOfWeek(date))).toBe('2026-09-27');
    expect(isSameDay(date, new Date(2026, 8, 30, 1))).toBe(true);
    expect(isBeforeDay(new Date(2026, 8, 29, 23), date)).toBe(true);
    expect(weekdayShort(date)).toBe('Wed');
    expect(monthShort(date)).toBe('Sep');
  });

  test('formats times, full due dates, and ranges', () => {
    expect(formatTime24to12('00:05')).toBe('12:05 AM');
    expect(formatTime24to12('12:30')).toBe('12:30 PM');
    expect(formatDueFull()).toBe('None');
    expect(formatDueFull('2026-09-27', '18:00')).toBe('Sun, Sep 27 · 6:00 PM');
    expect(dayRangeLabel(new Date(2026, 7, 3), new Date(2026, 7, 9))).toBe('Aug 3 – 9');
    expect(dayRangeLabel(new Date(2026, 7, 30), new Date(2026, 8, 5))).toBe('Aug 30 – Sep 5');
  });

  test('formats elapsed sync time and handles missing or invalid timestamps', () => {
    const now = new Date(2026, 8, 27, 16, 30);
    expect(elapsedShort(now, '2026-09-27T16:29:30')).toBe('now');
    expect(elapsedShort(now, '2026-09-27T16:27:00')).toBe('3m');
    expect(elapsedShort(now, '2026-09-27T14:30:00')).toBe('2h');
    expect(elapsedShort(now, '2026-09-23T16:30:00')).toBe('4d');
    expect(lastSyncedLabel(now)).toBe('Not synced yet');
    expect(lastSyncedLabel(now, 'invalid')).toBe('Last synced');
    expect(lastSyncedLabel(now, '2026-09-27T16:27:00')).toContain('today');
    expect(lastSyncedLabel(now, '2026-09-26T16:30:00')).toContain('1d ago');
  });

  test('marks only incomplete tasks from earlier dates overdue', () => {
    const now = new Date(2026, 8, 27, 12);
    expect(isOverdue(now, { dueDate: '2026-09-26', completed: false })).toBe(true);
    expect(isOverdue(now, { dueDate: '2026-09-27', completed: false })).toBe(false);
    expect(isOverdue(now, { dueDate: '2026-09-26', completed: true })).toBe(false);
    expect(isOverdue(now, { completed: false })).toBe(false);
  });
});

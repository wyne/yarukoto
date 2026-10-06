import {
  formatReminder,
  hasReminder,
  isReminderOffset,
  isReminderTime,
  normalizeReminders,
  normalizeTaskPatch,
  reminderOffsetLabel,
  reminderOffsetOptions,
  reminderOffsetUnit,
  reminderPresets,
  reminderSummary,
  snapReminderOffset,
  taskPatchForReminders,
} from '../src/data/reminders';

describe('reminder values', () => {
  test('validates and normalizes reminder input', () => {
    expect(isReminderTime('00:00')).toBe(true);
    expect(isReminderTime('23:59')).toBe(true);
    expect(isReminderTime('24:00')).toBe(false);
    expect(isReminderOffset(3650)).toBe(true);
    expect(isReminderOffset(-1)).toBe(false);
    expect(isReminderOffset(1.5)).toBe(false);

    expect(normalizeReminders([
      { id: 'later', offsetDays: 1, time: '09:00', ignored: true },
      { id: 'duplicate', offsetDays: 1, time: '09:00' },
      { id: 'due', offsetDays: 0, time: '08:30' },
      { id: 'bad-time', offsetDays: 2, time: 'noon' },
      null,
    ])).toEqual([
      { id: 'later', offsetDays: 1, time: '09:00' },
      { id: 'due', offsetDays: 0, time: '08:30' },
    ]);
    expect(normalizeReminders('not-an-array')).toEqual([]);
  });

  test('builds offset wheel choices and snaps values to valid rungs', () => {
    expect(reminderOffsetUnit(14)).toBe('week');
    expect(reminderOffsetUnit(8)).toBe('day');
    expect(reminderOffsetOptions('week').slice(0, 3)).toEqual([
      { offsetDays: 0, label: 'Due date' },
      { offsetDays: 7, label: '1 week' },
      { offsetDays: 14, label: '2 weeks' },
    ]);
    expect(snapReminderOffset(10, 'week')).toBe(7);
    expect(snapReminderOffset(-5, 'day')).toBe(0);
    expect(snapReminderOffset(500, 'day')).toBe(30);
  });

  test('deduplicates due-time presets and formats summaries', () => {
    expect(reminderPresets('09:00')).toHaveLength(4);
    expect(reminderPresets('18:30').at(-1)).toEqual({
      offsetDays: 0,
      time: '18:30',
      label: 'Due date (6:30 PM)',
    });
    expect(reminderOffsetLabel(0)).toBe('Due date');
    expect(reminderOffsetLabel(1)).toBe('1 day before');
    expect(reminderOffsetLabel(14)).toBe('2 weeks before');
    expect(reminderOffsetLabel(3)).toBe('3 days before');
    expect(formatReminder({ offsetDays: 7, time: '09:00' })).toBe('1 week before (9:00 AM)');
    expect(reminderSummary(undefined)).toBe('None');
    expect(reminderSummary([{ id: 'a', offsetDays: 0, time: '09:00' }])).toBe('Due date (9:00 AM)');
    expect(reminderSummary([
      { id: 'a', offsetDays: 0, time: '09:00' },
      { id: 'b', offsetDays: 1, time: '09:00' },
    ])).toBe('2 reminders');
  });

  test('detects equivalent reminders independent of id', () => {
    expect(hasReminder(
      [{ id: 'existing', offsetDays: 2, time: '10:00' }],
      { offsetDays: 2, time: '10:00' }
    )).toBe(true);
    expect(hasReminder([], { offsetDays: 2, time: '10:00' })).toBe(false);
  });

  test('keeps due dates and reminders internally consistent', () => {
    const reminders = [{ id: 'a', offsetDays: 0, time: '09:00' }];
    expect(taskPatchForReminders({}, reminders, new Date(2026, 8, 27, 18))).toEqual({
      dueDate: '2026-09-27',
      reminders,
    });
    expect(taskPatchForReminders({ dueDate: '2026-10-01' }, [])).toEqual({
      dueDate: '2026-10-01',
      reminders: undefined,
    });
    expect(normalizeTaskPatch({ dueDate: undefined, dueTime: '10:00', reminders })).toEqual({
      dueDate: undefined,
      dueTime: undefined,
      reminders: undefined,
      repeat: null,
    });
    expect(normalizeTaskPatch({ title: 'Keep me', reminders: [] })).toEqual({
      title: 'Keep me',
      reminders: undefined,
    });
    const untouched = { title: 'Untouched' };
    expect(normalizeTaskPatch(untouched)).toBe(untouched);
  });
});

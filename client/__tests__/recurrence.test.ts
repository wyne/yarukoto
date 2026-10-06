import {
  completeRepeating,
  describeRepeat,
  firstOccurrenceOnOrAfter,
  formatRepeatRule,
  nextOccurrence,
  normalizeRepeat,
  occurrenceId,
  parseRepeatPhrase,
  parseRepeatRule,
  repeatPresets,
  skipRepeating,
} from '../src/data/recurrence';
import type { Task, TaskRepeat } from '../src/data/types';

const due = (rule: string): TaskRepeat => ({ rule, from: 'due' });

/** Every date the series lands on, starting from `start`, for `n` completions. */
function walk(repeat: TaskRepeat, start: string, n: number): string[] {
  const out = [start];
  let current = start;
  let r = repeat;
  for (let i = 0; i < n; i++) {
    const next = nextOccurrence(r, current, current);
    if (!next) break;
    out.push(next);
    current = next;
    const rule = parseRepeatRule(r.rule)!;
    if (rule.count !== undefined) {
      rule.count -= 1;
      r = { rule: formatRepeatRule(rule), from: r.from };
    }
  }
  return out;
}

function task(fields: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    title: 'Water plants',
    notes: '',
    priority: 'none',
    dueDate: '2026-10-05',
    listId: null,
    tags: [],
    subtasks: [
      { id: 's1', title: 'Ferns', done: true },
      { id: 's2', title: 'Cactus', done: false },
    ],
    completed: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    order: 0,
    repeat: due('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'),
    ...fields,
  };
}

describe('parseRepeatRule', () => {
  test('reads TickTick-style rules, with or without the RRULE: prefix', () => {
    const rule = parseRepeatRule('RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR;UNTIL=20271231T000000Z;TT_SKIP=HOLIDAY,WEEKEND');
    expect(rule).toEqual({
      freq: 'monthly',
      interval: 2,
      byDay: [{ day: 5, nth: -1 }],
      byMonthDay: [],
      byMonth: [],
      bySetPos: [],
      until: '2027-12-31',
      skipWeekends: true,
    });
  });

  test('rejects what it cannot follow', () => {
    expect(parseRepeatRule('FREQ=HOURLY')).toBeNull();
    expect(parseRepeatRule('INTERVAL=2')).toBeNull();
    expect(parseRepeatRule('FREQ=WEEKLY;BYDAY=XX')).toBeNull();
    expect(parseRepeatRule('FREQ=DAILY;INTERVAL=0')).toBeNull();
    expect(parseRepeatRule('')).toBeNull();
  });

  test('normalizes to one canonical spelling', () => {
    expect(normalizeRepeat({ rule: 'freq=weekly;byday=mo,we;wkst=MO', from: 'nonsense' })).toEqual({
      rule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE',
      from: 'due',
    });
    expect(normalizeRepeat({ rule: 'garbage', from: 'due' })).toBeNull();
    expect(normalizeRepeat(null)).toBeNull();
  });
});

describe('nextOccurrence from the due date', () => {
  test('daily and every N days', () => {
    expect(walk(due('FREQ=DAILY;INTERVAL=1'), '2026-10-30', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(walk(due('FREQ=DAILY;INTERVAL=3'), '2026-10-30', 2)).toEqual(['2026-10-30', '2026-11-02', '2026-11-05']);
  });

  test('crosses daylight saving without drifting a day', () => {
    // New York falls back on 2026-11-01.
    expect(walk(due('FREQ=DAILY;INTERVAL=1'), '2026-10-31', 2)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  test('weekly on several days, and every other week', () => {
    // 2026-10-05 is a Monday.
    expect(walk(due('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR'), '2026-10-05', 4)).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
      '2026-10-14',
    ]);
    expect(walk(due('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SA'), '2026-10-06', 3)).toEqual([
      '2026-10-06',
      '2026-10-10',
      '2026-10-20',
      '2026-10-24',
    ]);
    // Sunday ends the week, since weeks start on Monday.
    expect(walk(due('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU'), '2026-10-05', 3)).toEqual([
      '2026-10-05',
      '2026-10-11',
      '2026-10-19',
      '2026-10-25',
    ]);
  });

  test('weekly with no days keeps the due date weekday', () => {
    expect(walk(due('FREQ=WEEKLY;INTERVAL=1'), '2026-10-08', 2)).toEqual(['2026-10-08', '2026-10-15', '2026-10-22']);
  });

  test('every weekday skips the weekend', () => {
    expect(walk(due('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR'), '2026-10-08', 3)).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-12',
      '2026-10-13',
    ]);
  });

  test('monthly by day, by last day, and by nth weekday', () => {
    expect(walk(due('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15'), '2026-10-15', 2)).toEqual(['2026-10-15', '2026-11-15', '2026-12-15']);
    expect(walk(due('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1'), '2027-01-31', 3)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
    // Second Tuesday.
    expect(walk(due('FREQ=MONTHLY;INTERVAL=1;BYDAY=2TU'), '2026-10-13', 2)).toEqual(['2026-10-13', '2026-11-10', '2026-12-08']);
    // Last Friday.
    expect(walk(due('FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR'), '2026-10-30', 2)).toEqual(['2026-10-30', '2026-11-27', '2026-12-25']);
    // Last weekday of the month.
    expect(walk(due('FREQ=MONTHLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'), '2026-10-30', 2)).toEqual([
      '2026-10-30',
      '2026-11-30',
      '2026-12-31',
    ]);
  });

  test('monthly on the 31st skips months without one, as the RFC does', () => {
    expect(walk(due('FREQ=MONTHLY;INTERVAL=1'), '2026-10-31', 2)).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']);
  });

  test('yearly, including Feb 29', () => {
    expect(walk(due('FREQ=YEARLY;INTERVAL=1;BYMONTH=3;BYMONTHDAY=4'), '2026-03-04', 2)).toEqual(['2026-03-04', '2027-03-04', '2028-03-04']);
    expect(walk(due('FREQ=YEARLY;INTERVAL=1'), '2028-02-29', 1)).toEqual(['2028-02-29', '2032-02-29']);
  });

  test('COUNT counts down and ends the series', () => {
    expect(walk(due('FREQ=DAILY;INTERVAL=1;COUNT=3'), '2026-10-01', 5)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  test('UNTIL ends the series', () => {
    expect(walk(due('FREQ=WEEKLY;INTERVAL=1;UNTIL=20261020'), '2026-10-01', 5)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
  });

  test("TickTick's weekend skip", () => {
    expect(walk(due('FREQ=DAILY;INTERVAL=1;TT_SKIP=WEEKEND'), '2026-10-08', 3)).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-12',
      '2026-10-13',
    ]);
  });
});

describe('nextOccurrence from the completion date', () => {
  const after = (rule: string): TaskRepeat => ({ rule, from: 'completion' });

  test('counts whole periods from the day it was done', () => {
    expect(nextOccurrence(after('FREQ=DAILY;INTERVAL=3'), '2026-10-01', '2026-10-10')).toBe('2026-10-13');
    expect(nextOccurrence(after('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'), '2026-10-01', '2026-10-10')).toBe('2026-10-24');
    expect(nextOccurrence(after('FREQ=MONTHLY;INTERVAL=1'), '2026-01-01', '2027-01-31')).toBe('2027-02-28');
  });
});

describe('completeRepeating', () => {
  const at = '2026-10-05T14:00:00.000Z';

  test('moves the series on and keeps a completed copy of the occurrence', () => {
    const rolled = completeRepeating(task(), at, '2026-10-05')!;
    expect(rolled.series).toMatchObject({
      id: 't-1',
      dueDate: '2026-10-12',
      completed: false,
      updatedAt: at,
      repeat: due('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'),
    });
    expect(rolled.series.completedAt).toBeUndefined();
    expect(rolled.series.subtasks.map((s) => s.done)).toEqual([false, false]);
    expect(rolled.occurrence).toMatchObject({
      id: occurrenceId('t-1', '2026-10-05'),
      dueDate: '2026-10-05',
      completed: true,
      completedAt: at,
      updatedAt: at,
      repeat: null,
    });
    // The copy keeps the checklist as it was when the occurrence was done.
    expect(rolled.occurrence.subtasks.map((s) => s.done)).toEqual([true, false]);
  });

  test('the same occurrence always gets the same copy id', () => {
    const a = completeRepeating(task(), at, '2026-10-05')!;
    const b = completeRepeating(task(), '2026-10-05T20:00:00.000Z', '2026-10-05')!;
    expect(a.occurrence.id).toBe(b.occurrence.id);
    expect(a.series.dueDate).toBe(b.series.dueDate);
  });

  test('null for the last occurrence, a task without a date, or one already done', () => {
    expect(completeRepeating(task({ repeat: due('FREQ=DAILY;INTERVAL=1;COUNT=1') }), at, '2026-10-05')).toBeNull();
    expect(completeRepeating(task({ dueDate: undefined }), at, '2026-10-05')).toBeNull();
    expect(completeRepeating(task({ completed: true }), at, '2026-10-05')).toBeNull();
    expect(completeRepeating(task({ repeat: null }), at, '2026-10-05')).toBeNull();
  });

  test('uses up one COUNT per completion', () => {
    const rolled = completeRepeating(task({ repeat: due('FREQ=DAILY;INTERVAL=1;COUNT=3') }), at, '2026-10-05')!;
    expect(rolled.series.repeat).toEqual(due('FREQ=DAILY;INTERVAL=1;COUNT=2'));
  });

  test('skip moves on without a copy', () => {
    const skipped = skipRepeating(task(), at, '2026-10-05')!;
    expect(skipped.dueDate).toBe('2026-10-12');
    expect(skipped.completed).toBe(false);
    expect(skipRepeating(task({ repeat: due('FREQ=DAILY;INTERVAL=1;COUNT=1') }), at, '2026-10-05')).toBeNull();
  });
});

describe('describeRepeat', () => {
  test('reads like TickTick', () => {
    expect(describeRepeat(due('FREQ=DAILY;INTERVAL=1'))).toBe('Daily');
    expect(describeRepeat(due('FREQ=DAILY;INTERVAL=2'))).toBe('Every 2 days');
    expect(describeRepeat(due('FREQ=WEEKLY;INTERVAL=1;BYDAY=WE,MO'))).toBe('Weekly on Mon, Wed');
    expect(describeRepeat(due('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR'))).toBe('Every weekday');
    expect(describeRepeat(due('FREQ=WEEKLY;INTERVAL=1'), '2026-10-08')).toBe('Weekly on Thu');
    expect(describeRepeat(due('FREQ=MONTHLY;INTERVAL=1;BYDAY=2TU'))).toBe('Monthly on the 2nd Tuesday');
    expect(describeRepeat(due('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1'))).toBe('Monthly on the last day');
    expect(describeRepeat(due('FREQ=MONTHLY;INTERVAL=1'), '2026-10-22')).toBe('Monthly on the 22nd');
    expect(describeRepeat(due('FREQ=YEARLY;INTERVAL=1;BYMONTH=3;BYMONTHDAY=4'))).toBe('Yearly on Mar 4');
    expect(describeRepeat({ rule: 'FREQ=DAILY;INTERVAL=3', from: 'completion' })).toBe('Every 3 days after completion');
    expect(describeRepeat(due('FREQ=DAILY;INTERVAL=1;COUNT=4'))).toBe('Daily, 4 more times');
    expect(describeRepeat(due('FREQ=DAILY;INTERVAL=1;UNTIL=20261231'))).toBe('Daily, until Dec 31, 2026');
    expect(describeRepeat(null)).toBe('None');
  });
});

describe('repeatPresets', () => {
  test('are worded for the task date', () => {
    expect(repeatPresets('2026-10-13').map((p) => p.label)).toEqual([
      'Daily',
      'Weekly (Tue)',
      'Every weekday (Mon–Fri)',
      'Monthly (the 13th)',
      'Yearly (Oct 13)',
    ]);
  });
});

describe('parseRepeatPhrase', () => {
  const rule = (text: string) => parseRepeatPhrase(text.split(' '));

  test('reads the common phrasings', () => {
    expect(rule('daily')).toEqual({ repeat: due('FREQ=DAILY;INTERVAL=1'), wordCount: 1 });
    expect(rule('every day')?.repeat).toEqual(due('FREQ=DAILY;INTERVAL=1'));
    expect(rule('every other week')?.repeat).toEqual(due('FREQ=WEEKLY;INTERVAL=2'));
    expect(rule('every 3 months')?.repeat).toEqual(due('FREQ=MONTHLY;INTERVAL=3'));
    expect(rule('every mon, wed and fri')).toEqual({ repeat: due('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR'), wordCount: 5 });
    expect(rule('every weekday')?.repeat).toEqual(due('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR'));
    expect(rule('every 15th')?.repeat).toEqual(due('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15'));
    expect(rule('every last day')?.repeat).toEqual(due('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1'));
    expect(rule('every 2nd tue')?.repeat).toEqual(due('FREQ=MONTHLY;INTERVAL=1;BYDAY=2TU'));
    expect(rule('every last friday')?.repeat).toEqual(due('FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR'));
    expect(rule('every week on mon, thu')?.repeat).toEqual(due('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH'));
    expect(rule('every year')?.repeat).toEqual(due('FREQ=YEARLY;INTERVAL=1'));
  });

  test('completion-based: Todoist every! and TickTick "after completion"', () => {
    expect(rule('every! 3 days')?.repeat).toEqual({ rule: 'FREQ=DAILY;INTERVAL=3', from: 'completion' });
    expect(rule('every 2 weeks after completion')).toEqual({
      repeat: { rule: 'FREQ=WEEKLY;INTERVAL=2', from: 'completion' },
      wordCount: 5,
    });
  });

  test('leaves ordinary words alone', () => {
    expect(rule('every time I forget')).toBeNull();
    expect(rule('everyone')).toBeNull();
    expect(rule('every')).toBeNull();
  });
});

describe('firstOccurrenceOnOrAfter', () => {
  test('starts a dateless repeat on its first matching day', () => {
    // 2026-10-02 is a Friday.
    expect(firstOccurrenceOnOrAfter(due('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'), '2026-10-02')).toBe('2026-10-05');
    expect(firstOccurrenceOnOrAfter(due('FREQ=WEEKLY;INTERVAL=1;BYDAY=FR'), '2026-10-02')).toBe('2026-10-02');
    expect(firstOccurrenceOnOrAfter(due('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15'), '2026-10-20')).toBe('2026-11-15');
    expect(firstOccurrenceOnOrAfter(due('FREQ=DAILY;INTERVAL=1'), '2026-10-02')).toBe('2026-10-02');
  });
});

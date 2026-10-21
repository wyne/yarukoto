import { parseQuickAdd, quickAddSpans, shiftLiteralRanges } from '../src/data/quickAdd';

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

  test('reads a weekday only from a prefix of its name', () => {
    expect(parseQuickAdd('feed the monkey', now)).toMatchObject({ title: 'feed the monkey', dueDate: undefined });
    expect(parseQuickAdd('buy satin thurs', now)).toMatchObject({ title: 'buy satin', dueDate: '2026-10-01' });
  });

  test('keeps a time-looking token in the title without a due date', () => {
    expect(parseQuickAdd('Review 6pm draft', now).title).toBe('Review 6pm draft');
  });

  test('accepts today, full weekday names, noon, and priority aliases', () => {
    expect(parseQuickAdd('Lunch today 12pm !l #Food', now)).toEqual({
      title: 'Lunch',
      priority: 'low',
      dueDate: '2026-09-27',
      dueTime: '12:00',
      tags: ['food'],
      listName: undefined,
    });
    expect(parseQuickAdd('Standup Monday 12am', now)).toEqual(expect.objectContaining({
      title: 'Standup',
      dueDate: '2026-09-28',
      dueTime: '00:00',
    }));
  });

  test('leaves malformed time and unknown priority tokens in the title', () => {
    expect(parseQuickAdd('Call tomorrow 25:00 !urgent', now)).toEqual(expect.objectContaining({
      title: 'Call 25:00 !urgent',
      dueDate: '2026-09-28',
      dueTime: undefined,
      priority: 'none',
    }));
  });
});

describe('quick add repeats', () => {
  // A Sunday.
  const now = new Date(2026, 8, 27, 12);

  test('"every …" sets a repeat and starts it on its first day', () => {
    expect(parseQuickAdd('Take out bins every mon 7pm #home', now)).toEqual({
      title: 'Take out bins',
      priority: 'none',
      dueDate: '2026-09-28',
      dueTime: '19:00',
      tags: ['home'],
      listName: undefined,
      repeat: { rule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', from: 'due' },
    });
  });

  test('a typed date wins as the first occurrence', () => {
    expect(parseQuickAdd('Stretch every day tomorrow', now)).toMatchObject({
      title: 'Stretch',
      dueDate: '2026-09-28',
      repeat: { rule: 'FREQ=DAILY;INTERVAL=1', from: 'due' },
    });
  });

  test('ordinary uses of the words stay in the title', () => {
    const parsed = parseQuickAdd('Write weekly report every time it rains', now);
    expect(parsed.title).toBe('Write weekly report every time it rains');
    expect(parsed.repeat).toBeUndefined();
  });
});

describe('quick add spans', () => {
  const now = new Date(2026, 8, 27, 12);
  const words = (input: string) => quickAddSpans(input, now).map((s) => [s.kind, input.slice(s.start, s.end)]);

  test('marks each recognized token where it was typed', () => {
    expect(words('Pay rent fri 6pm #Home !high ~Admin')).toEqual([
      ['date', 'fri'],
      ['time', '6pm'],
      ['tag', '#Home'],
      ['priority', '!high'],
      ['list', '~Admin'],
    ]);
  });

  test('keeps offsets right across leading and repeated whitespace', () => {
    expect(words('  call   mom  tmrw')).toEqual([['date', 'tmrw']]);
  });

  test('covers a whole repeat phrase as one span', () => {
    expect(words('standup every mon, wed 9am')).toEqual([
      ['repeat', 'every mon, wed'],
      ['time', '9am'],
    ]);
  });

  test('leaves title words that only look like tokens unmarked', () => {
    expect(words('Review 6pm draft !urgent #')).toEqual([]);
  });
});

describe('words kept as title text', () => {
  const now = new Date(2026, 8, 27, 12);
  const at = (text: string, word: string) => {
    const start = text.indexOf(word);
    return { start, end: start + word.length };
  };

  test('a kept word stays in the title and sets nothing', () => {
    const text = 'watch the today show #tv !high ~Media';
    const literal = [at(text, 'today'), at(text, '#tv'), at(text, '!high'), at(text, '~Media')];
    expect(parseQuickAdd(text, now, literal)).toEqual({
      title: 'watch the today show #tv !high ~Media',
      priority: 'none',
      dueDate: undefined,
      dueTime: undefined,
      tags: [],
      listName: undefined,
    });
    expect(quickAddSpans(text, now, literal)).toEqual([]);
  });

  test('a kept date no longer lets a time count', () => {
    const text = 'today 6pm standup';
    expect(parseQuickAdd(text, now, [at(text, 'today')])).toMatchObject({
      title: 'today 6pm standup',
      dueDate: undefined,
      dueTime: undefined,
    });
  });

  test('a kept repeat keeps all of its words', () => {
    const text = 'every monday review';
    expect(parseQuickAdd(text, now, [{ start: 0, end: 'every monday'.length }])).toMatchObject({
      title: 'every monday review',
      dueDate: undefined,
    });
  });

  test('other words still tokenize', () => {
    const text = 'today show tomorrow';
    expect(parseQuickAdd(text, now, [at(text, 'today')])).toMatchObject({
      title: 'today show',
      dueDate: '2026-09-28',
    });
  });

  test('ranges move with edits around them', () => {
    const r = [{ start: 6, end: 11 }]; // "today" in "watch today"
    expect(shiftLiteralRanges('watch today', 'go watch today', r)).toEqual([{ start: 9, end: 14 }]);
    expect(shiftLiteralRanges('watch today', 'watch today show', r)).toEqual(r);
    expect(shiftLiteralRanges('watch today', 'watch', r)).toEqual([]);
  });

  test('a range is dropped once its word is edited or joined', () => {
    const r = [{ start: 6, end: 11 }];
    expect(shiftLiteralRanges('watch today', 'watch todays', r)).toEqual([]);
    expect(shiftLiteralRanges('watch today', 'watch tday', r)).toEqual([]);
    expect(shiftLiteralRanges('watch today', 'watchtoday', r)).toEqual([]);
  });
});

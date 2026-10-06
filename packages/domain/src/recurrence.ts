import { Task, TaskRepeat } from './types';
import { addDays, fromISODate, toISODate } from './dates';

/**
 * Repeating tasks, modelled on TickTick's.
 *
 * A repeating task is one row — the *series* — whose due date moves forward each
 * time it is completed. The occurrence that was just done is kept as its own
 * completed row, so "what did I do last week" still has an answer, exactly as
 * TickTick leaves a completed copy behind in the list.
 *
 * Rules are RFC 5545 RRULE bodies, which is also what TickTick stores, so an
 * imported rule is kept as written. The subset understood here is everything
 * TickTick's own repeat picker can produce:
 *
 *   FREQ       DAILY | WEEKLY | MONTHLY | YEARLY
 *   INTERVAL   every N periods
 *   BYDAY      weekdays (MO,WE) — or, monthly, the nth one (2TU, -1FR)
 *   BYMONTHDAY day of the month, negative from the end (-1 = the last day)
 *   BYMONTH    month of the year, for yearly rules
 *   BYSETPOS   the nth of the month's candidates (-1 with MO..FR = last weekday)
 *   COUNT      how many occurrences are *left*, this one included
 *   UNTIL      the last date an occurrence may fall on
 *   TT_SKIP    TickTick's WEEKEND skip; HOLIDAY is accepted and ignored
 *
 * Shared because the app rolls a series forward when you tick it off, and the
 * server does the same for every other way in — the task API, MCP, Home
 * Assistant, a notification's "Mark done". Both must land on the same date and
 * the same id for the completed copy, so a completion made twice merges.
 *
 * Written without spread or destructuring: see the note in dates.ts.
 */

export type RepeatFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RepeatWeekday {
  /** 0 = Sunday, as Date.getDay(). */
  day: number;
  /** Monthly only: 1..5 for the nth, -1..-5 counting back from the end. */
  nth?: number;
}

export interface RepeatRule {
  freq: RepeatFrequency;
  interval: number;
  byDay: RepeatWeekday[];
  byMonthDay: number[];
  /** 1..12. */
  byMonth: number[];
  bySetPos: number[];
  /** Occurrences remaining, counting the current one. */
  count?: number;
  /** ISO date; nothing may fall after it. */
  until?: string;
  skipWeekends: boolean;
}

const FREQS: Record<string, RepeatFrequency> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_INTERVAL = 999;
/** How many periods to look through before giving up on a rule that never fires. */
const MAX_PERIODS = 2000;

export const REPEAT_FROM_VALUES: TaskRepeat['from'][] = ['due', 'completion'];

function parseIntStrict(value: string): number | null {
  if (!/^[+-]?\d+$/.test(value)) return null;
  return Number(value);
}

function parseUntil(value: string): string | undefined {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : undefined;
}

/** Null for anything that isn't a rule this module can follow. */
export function parseRepeatRule(text: string): RepeatRule | null {
  if (typeof text !== 'string') return null;
  const body = text.trim().replace(/^RRULE:/i, '');
  if (!body) return null;
  const rule: RepeatRule = { freq: 'daily', interval: 1, byDay: [], byMonthDay: [], byMonth: [], bySetPos: [], skipWeekends: false };
  let freq: RepeatFrequency | undefined;

  for (const part of body.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) return null;
    const key = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    if (key === 'FREQ') {
      freq = FREQS[value.toUpperCase()];
      if (!freq) return null;
    } else if (key === 'INTERVAL') {
      const n = parseIntStrict(value);
      if (n === null || n < 1 || n > MAX_INTERVAL) return null;
      rule.interval = n;
    } else if (key === 'BYDAY') {
      for (const item of value.split(',')) {
        const m = item.trim().toUpperCase().match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/);
        if (!m) return null;
        const day = DAY_CODES.indexOf(m[2]);
        if (m[1] !== undefined) {
          const nth = Number(m[1]);
          if (nth === 0 || nth > 5 || nth < -5) return null;
          rule.byDay.push({ day: day, nth: nth });
        } else {
          rule.byDay.push({ day: day });
        }
      }
    } else if (key === 'BYMONTHDAY') {
      for (const item of value.split(',')) {
        const n = parseIntStrict(item.trim());
        if (n === null || n === 0 || n > 31 || n < -31) return null;
        rule.byMonthDay.push(n);
      }
    } else if (key === 'BYMONTH') {
      for (const item of value.split(',')) {
        const n = parseIntStrict(item.trim());
        if (n === null || n < 1 || n > 12) return null;
        rule.byMonth.push(n);
      }
    } else if (key === 'BYSETPOS') {
      for (const item of value.split(',')) {
        const n = parseIntStrict(item.trim());
        if (n === null || n === 0 || n > 366 || n < -366) return null;
        rule.bySetPos.push(n);
      }
    } else if (key === 'COUNT') {
      const n = parseIntStrict(value);
      if (n === null || n < 1) return null;
      rule.count = n;
    } else if (key === 'UNTIL') {
      const until = parseUntil(value);
      if (!until) return null;
      rule.until = until;
    } else if (key === 'TT_SKIP') {
      rule.skipWeekends = value.toUpperCase().split(',').indexOf('WEEKEND') >= 0;
    }
    // WKST and anything else are accepted and dropped: the week starts on
    // Monday here, which is the RFC's default and what TickTick writes.
  }
  if (!freq) return null;
  rule.freq = freq;
  return rule;
}

function upperFreq(freq: RepeatFrequency): string {
  return freq.toUpperCase();
}

function weekdayCode(w: RepeatWeekday): string {
  return (w.nth !== undefined ? String(w.nth) : '') + DAY_CODES[w.day];
}

/** The canonical text for a rule, so two spellings of one rule compare equal. */
export function formatRepeatRule(rule: RepeatRule): string {
  const parts = [`FREQ=${upperFreq(rule.freq)}`, `INTERVAL=${rule.interval}`];
  if (rule.byMonth.length) parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  if (rule.byMonthDay.length) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.byDay.length) parts.push(`BYDAY=${rule.byDay.map(weekdayCode).join(',')}`);
  if (rule.bySetPos.length) parts.push(`BYSETPOS=${rule.bySetPos.join(',')}`);
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.replace(/-/g, '')}`);
  if (rule.skipWeekends) parts.push('TT_SKIP=WEEKEND');
  return parts.join(';');
}

/**
 * A stored repeat, cleaned: null unless the rule parses and `from` is known.
 * Both sides run what they receive through this, so a malformed value from an
 * older build or a hand-edited database never reaches the date arithmetic.
 */
export function normalizeRepeat(value: unknown): TaskRepeat | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { rule?: unknown; from?: unknown };
  if (typeof candidate.rule !== 'string') return null;
  const rule = parseRepeatRule(candidate.rule);
  if (!rule) return null;
  const from = candidate.from === 'completion' ? 'completion' : 'due';
  return { rule: formatRepeatRule(rule), from: from };
}

export function sameRepeat(a: TaskRepeat | null | undefined, b: TaskRepeat | null | undefined): boolean {
  const left = normalizeRepeat(a);
  const right = normalizeRepeat(b);
  if (!left || !right) return !left && !right;
  return left.rule === right.rule && left.from === right.from;
}

// ---- Date arithmetic -----------------------------------------------------------

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** Monday of the week `d` is in. */
function weekStart(d: Date): Date {
  const offset = (d.getDay() + 6) % 7;
  return addDays(d, -offset);
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function sortDates(dates: Date[]): Date[] {
  return dates.slice().sort((a, b) => a.getTime() - b.getTime());
}

function uniqueDates(dates: Date[]): Date[] {
  const seen: Record<string, boolean> = {};
  const out: Date[] = [];
  for (const d of dates) {
    const key = toISODate(d);
    if (seen[key]) continue;
    seen[key] = true;
    out.push(d);
  }
  return out;
}

function applySetPos(dates: Date[], positions: number[]): Date[] {
  if (!positions.length) return dates;
  const out: Date[] = [];
  for (const pos of positions) {
    const index = pos > 0 ? pos - 1 : dates.length + pos;
    if (index >= 0 && index < dates.length) out.push(dates[index]);
  }
  return sortDates(uniqueDates(out));
}

/** Every date in one month the rule allows, before BYSETPOS. */
function monthCandidates(rule: RepeatRule, year: number, month0: number, anchor: Date): Date[] {
  const total = daysInMonth(year, month0);
  let days: number[] = [];

  if (rule.byMonthDay.length) {
    for (const n of rule.byMonthDay) {
      const day = n > 0 ? n : total + n + 1;
      if (day >= 1 && day <= total) days.push(day);
    }
  }

  if (rule.byDay.length) {
    const fromWeekdays: number[] = [];
    for (const w of rule.byDay) {
      const matching: number[] = [];
      for (let day = 1; day <= total; day++) {
        if (new Date(year, month0, day).getDay() === w.day) matching.push(day);
      }
      if (w.nth === undefined) {
        for (const day of matching) fromWeekdays.push(day);
      } else {
        const index = w.nth > 0 ? w.nth - 1 : matching.length + w.nth;
        if (index >= 0 && index < matching.length) fromWeekdays.push(matching[index]);
      }
    }
    // Both given means both must hold, as the RFC has it.
    days = rule.byMonthDay.length ? days.filter((d) => fromWeekdays.indexOf(d) >= 0) : fromWeekdays;
  }

  if (!rule.byMonthDay.length && !rule.byDay.length) {
    // Same day of the month as the series' date; a month without that day is
    // skipped, which is the RFC's reading of "monthly on the 31st".
    const day = anchor.getDate();
    if (day <= total) days.push(day);
  }

  const dates: Date[] = [];
  for (const day of days) dates.push(new Date(year, month0, day));
  return applySetPos(sortDates(uniqueDates(dates)), rule.bySetPos);
}

/** The dates the rule allows in the `k`th period after the anchor's own. */
function periodCandidates(rule: RepeatRule, anchor: Date, k: number): Date[] {
  const step = k * rule.interval;
  if (rule.freq === 'daily') return [addDays(anchor, step)];

  if (rule.freq === 'weekly') {
    const start = addDays(weekStart(anchor), step * 7);
    const weekdays = rule.byDay.length ? rule.byDay.map((w) => w.day) : [anchor.getDay()];
    const out: Date[] = [];
    for (const day of weekdays) out.push(addDays(start, (day + 6) % 7));
    return sortDates(uniqueDates(out));
  }

  if (rule.freq === 'monthly') {
    const index = anchor.getFullYear() * 12 + anchor.getMonth() + step;
    return monthCandidates(rule, Math.floor(index / 12), index % 12, anchor);
  }

  const year = anchor.getFullYear() + step;
  const months = rule.byMonth.length ? rule.byMonth.map((m) => m - 1) : [anchor.getMonth()];
  let out: Date[] = [];
  for (const month0 of months) {
    const yearlyRule: RepeatRule = {
      freq: rule.freq,
      interval: rule.interval,
      byDay: rule.byDay,
      byMonthDay: rule.byMonthDay,
      byMonth: rule.byMonth,
      bySetPos: [],
      skipWeekends: rule.skipWeekends,
    };
    out = out.concat(monthCandidates(yearlyRule, year, month0, anchor));
  }
  return applySetPos(sortDates(uniqueDates(out)), rule.bySetPos);
}

/**
 * The first date the rule allows strictly after `after`, counting periods from
 * `anchor` — the series' current due date, which stands in for the RFC's
 * DTSTART. Null when there isn't one within reach (UNTIL has passed, or a rule
 * like "February 30th" that never fires).
 */
export function nextRuleDate(rule: RepeatRule, anchorISO: string, afterISO: string): string | null {
  const anchor = fromISODate(anchorISO);
  for (let k = 0; k < MAX_PERIODS; k++) {
    const candidates = periodCandidates(rule, anchor, k);
    for (const date of candidates) {
      const iso = toISODate(date);
      if (iso <= afterISO) continue;
      if (rule.until && iso > rule.until) return null;
      if (rule.skipWeekends && isWeekend(date)) continue;
      return iso;
    }
    if (rule.until && candidates.length && toISODate(candidates[0]) > rule.until) return null;
  }
  return null;
}

/** `months` later, kept inside the month — Jan 31 plus one month is Feb 28. */
function addMonthsClamped(d: Date, months: number): Date {
  const index = d.getFullYear() * 12 + d.getMonth() + months;
  const year = Math.floor(index / 12);
  const month0 = index % 12;
  return new Date(year, month0, Math.min(d.getDate(), daysInMonth(year, month0)));
}

/**
 * TickTick's "repeat from completion date": the interval is counted from the
 * day it was done, in whole periods. Weekday lists and the like have no meaning
 * here and are ignored, as TickTick's picker doesn't offer them in this mode.
 */
function nextFromCompletion(rule: RepeatRule, completedOnISO: string): string | null {
  const base = fromISODate(completedOnISO);
  let next: Date;
  if (rule.freq === 'daily') next = addDays(base, rule.interval);
  else if (rule.freq === 'weekly') next = addDays(base, rule.interval * 7);
  else if (rule.freq === 'monthly') next = addMonthsClamped(base, rule.interval);
  else next = addMonthsClamped(base, rule.interval * 12);
  for (let i = 0; i < 7 && rule.skipWeekends && isWeekend(next); i++) next = addDays(next, 1);
  const iso = toISODate(next);
  if (rule.until && iso > rule.until) return null;
  return iso;
}

/**
 * Where the series goes after its current occurrence, or null when that was the
 * last one. `completedOn` is the user's calendar date of the completion.
 */
export function nextOccurrence(repeat: TaskRepeat, dueDate: string, completedOn: string): string | null {
  const rule = parseRepeatRule(repeat.rule);
  if (!rule) return null;
  if (rule.count !== undefined && rule.count <= 1) return null;
  return repeat.from === 'completion' ? nextFromCompletion(rule, completedOn) : nextRuleDate(rule, dueDate, dueDate);
}

/** The repeat after one occurrence is used up: COUNT goes down by one. */
function repeatAfterOne(repeat: TaskRepeat): TaskRepeat {
  const rule = parseRepeatRule(repeat.rule);
  if (!rule || rule.count === undefined) return repeat;
  rule.count = rule.count - 1;
  return { rule: formatRepeatRule(rule), from: repeat.from };
}

/**
 * The id the completed copy of an occurrence gets. Derived, not random, so two
 * devices completing the same occurrence — or the app and the server, after a
 * notification's "Mark done" — write the same row rather than two.
 */
export function occurrenceId(seriesId: string, dueDate: string): string {
  return `${seriesId}@${dueDate}`;
}

export interface RolledSeries {
  /** The series, moved to its next date and open again. */
  series: Task;
  /** The occurrence just finished, as a completed task of its own. */
  occurrence: Task;
}

function isRepeating(task: Task): task is Task & { repeat: TaskRepeat; dueDate: string } {
  return !!task.repeat && !!task.dueDate && !task.completed && !task.deletedAt;
}

/**
 * Completing an open repeating task. Null means "complete it like any other
 * task": it doesn't repeat, or this was its last occurrence.
 *
 * `at` stamps both rows, so a completion carried in from a notification keeps
 * the time it was actually tapped. Checklist items start unchecked again on the
 * next occurrence, as they do in TickTick.
 */
export function completeRepeating(task: Task, at: string, completedOn: string): RolledSeries | null {
  if (!isRepeating(task)) return null;
  const next = nextOccurrence(task.repeat, task.dueDate, completedOn);
  if (!next) return null;

  const occurrence: Task = Object.assign({}, task, {
    id: occurrenceId(task.id, task.dueDate),
    repeat: null,
    completed: true,
    completedAt: at,
    updatedAt: at,
    deletedAt: undefined,
  });
  const series: Task = Object.assign({}, task, {
    dueDate: next,
    repeat: repeatAfterOne(task.repeat),
    subtasks: task.subtasks.map((s) => Object.assign({}, s, { done: false })),
    completed: false,
    completedAt: undefined,
    updatedAt: at,
  });
  return { series: series, occurrence: occurrence };
}

/**
 * TickTick's "Skip": move to the next date without recording a completion.
 * Null when there is no next date to skip to.
 */
export function skipRepeating(task: Task, at: string, today: string): Task | null {
  if (!isRepeating(task)) return null;
  const next = nextOccurrence(task.repeat, task.dueDate, today);
  if (!next) return null;
  return Object.assign({}, task, {
    dueDate: next,
    repeat: repeatAfterOne(task.repeat),
    subtasks: task.subtasks.map((s) => Object.assign({}, s, { done: false })),
    updatedAt: at,
  });
}

// ---- Building and describing rules ------------------------------------------------

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function nthLabel(nth: number): string {
  if (nth === -1) return 'last';
  if (nth < 0) return `${ordinal(-nth)} to last`;
  return ordinal(nth);
}

/** Which of its weekday a date is in its month: 1..4, or -1 for a fifth, which is always the last. */
export function weekOfMonth(dateISO: string): number {
  const nth = Math.floor((fromISODate(dateISO).getDate() - 1) / 7) + 1;
  return nth === 5 ? -1 : nth;
}

const WEEKDAYS_MO_FR = [1, 2, 3, 4, 5];

function isWorkweek(days: RepeatWeekday[]): boolean {
  if (days.length !== 5) return false;
  const set = days.map((d) => d.day).filter((d) => d !== undefined).sort();
  return set.join(',') === WEEKDAYS_MO_FR.join(',') && days.every((d) => d.nth === undefined);
}

function plural(n: number, unit: string): string {
  return n === 1 ? unit : `${n} ${unit}s`;
}

/**
 * "Every 2 weeks on Mon, Wed" — the phrase a row and the detail view show.
 * Falls back to the due date for the parts a rule leaves to it.
 */
export function describeRepeat(repeat: TaskRepeat | null | undefined, dueDate?: string): string {
  const normalized = normalizeRepeat(repeat);
  if (!normalized) return 'None';
  const rule = parseRepeatRule(normalized.rule)!;
  const anchor = dueDate ? fromISODate(dueDate) : null;
  let text = '';

  if (rule.freq === 'daily') {
    text = rule.interval === 1 ? 'Daily' : `Every ${plural(rule.interval, 'day')}`;
  } else if (rule.freq === 'weekly') {
    if (rule.interval === 1 && isWorkweek(rule.byDay) && normalized.from === 'due') text = 'Every weekday';
    else {
      text = rule.interval === 1 ? 'Weekly' : `Every ${plural(rule.interval, 'week')}`;
      if (normalized.from === 'due') {
        const days = rule.byDay.length ? rule.byDay.map((w) => w.day) : anchor ? [anchor.getDay()] : [];
        const ordered = days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        if (ordered.length) text += ` on ${ordered.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
      }
    }
  } else if (rule.freq === 'monthly') {
    text = rule.interval === 1 ? 'Monthly' : `Every ${plural(rule.interval, 'month')}`;
    if (normalized.from === 'due') {
      if (rule.byDay.length === 1 && rule.byDay[0].nth !== undefined) {
        text += ` on the ${nthLabel(rule.byDay[0].nth)} ${WEEKDAY_LONG[rule.byDay[0].day]}`;
      } else if (rule.bySetPos.length === 1 && isWorkweek(rule.byDay)) {
        text += ` on the ${nthLabel(rule.bySetPos[0])} weekday`;
      } else if (rule.byMonthDay.length) {
        text += ` on the ${rule.byMonthDay.map((n) => (n === -1 ? 'last day' : n < 0 ? `${nthLabel(-n)} day` : ordinal(n))).join(', ')}`;
      } else if (anchor) {
        text += ` on the ${ordinal(anchor.getDate())}`;
      }
    }
  } else {
    text = rule.interval === 1 ? 'Yearly' : `Every ${plural(rule.interval, 'year')}`;
    if (normalized.from === 'due') {
      const month = rule.byMonth.length === 1 ? rule.byMonth[0] - 1 : anchor ? anchor.getMonth() : null;
      const day = rule.byMonthDay.length === 1 && rule.byMonthDay[0] > 0 ? rule.byMonthDay[0] : anchor ? anchor.getDate() : null;
      if (month !== null && day !== null && !rule.byDay.length) text += ` on ${MONTH_SHORT[month]} ${day}`;
    }
  }

  if (normalized.from === 'completion') text += ' after completion';
  if (rule.skipWeekends) text += ', skipping weekends';
  if (rule.count !== undefined) text += rule.count === 1 ? ', last time' : `, ${rule.count} more times`;
  else if (rule.until) {
    const until = fromISODate(rule.until);
    text += `, until ${MONTH_SHORT[until.getMonth()]} ${until.getDate()}, ${until.getFullYear()}`;
  }
  return text;
}

export interface RepeatPreset {
  key: string;
  label: string;
  repeat: TaskRepeat;
}

/** TickTick's quick choices, worded for the task's own date. */
export function repeatPresets(dueDate: string): RepeatPreset[] {
  const d = fromISODate(dueDate);
  const dayCode = DAY_CODES[d.getDay()];
  return [
    { key: 'daily', label: 'Daily', repeat: { rule: 'FREQ=DAILY;INTERVAL=1', from: 'due' } },
    { key: 'weekly', label: `Weekly (${WEEKDAY_SHORT[d.getDay()]})`, repeat: { rule: `FREQ=WEEKLY;INTERVAL=1;BYDAY=${dayCode}`, from: 'due' } },
    { key: 'weekdays', label: 'Every weekday (Mon–Fri)', repeat: { rule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR', from: 'due' } },
    { key: 'monthly', label: `Monthly (the ${ordinal(d.getDate())})`, repeat: { rule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=${d.getDate()}`, from: 'due' } },
    { key: 'yearly', label: `Yearly (${MONTH_SHORT[d.getMonth()]} ${d.getDate()})`, repeat: { rule: `FREQ=YEARLY;INTERVAL=1;BYMONTH=${d.getMonth() + 1};BYMONTHDAY=${d.getDate()}`, from: 'due' } },
  ].map((preset) => ({ key: preset.key, label: preset.label, repeat: normalizeRepeat(preset.repeat)! }));
}

/**
 * The first date on or after `fromISO` that a rule allows — where a task set to
 * "every Monday" with no date of its own should start.
 */
export function firstOccurrenceOnOrAfter(repeat: TaskRepeat, fromISO: string): string {
  const rule = parseRepeatRule(repeat.rule);
  if (!rule || repeat.from === 'completion') return fromISO;
  const dayBefore = toISODate(addDays(fromISODate(fromISO), -1));
  return nextRuleDate(rule, fromISO, dayBefore) ?? fromISO;
}

// ---- Phrases ------------------------------------------------------------------

const PHRASE_WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, sundays: 0,
  mon: 1, monday: 1, mondays: 1,
  tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  wed: 3, wednesday: 3, wednesdays: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
  fri: 5, friday: 5, fridays: 5,
  sat: 6, saturday: 6, saturdays: 6,
};
const UNIT_WORDS: Record<string, RepeatFrequency> = {
  day: 'daily', days: 'daily',
  week: 'weekly', weeks: 'weekly',
  month: 'monthly', months: 'monthly',
  year: 'yearly', years: 'yearly',
};
const NUMBER_WORDS: Record<string, number> = {
  other: 2, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1,
};

function ordinalValue(word: string): number | null {
  if (ORDINAL_WORDS[word] !== undefined) return ORDINAL_WORDS[word];
  const m = word.match(/^(\d{1,2})(st|nd|rd|th)$/);
  return m ? Number(m[1]) : null;
}

export interface ParsedRepeatPhrase {
  repeat: TaskRepeat;
  /** How many of the words given were the phrase, so a caller can keep the rest. */
  wordCount: number;
}

/**
 * Reads a repeat the way people type one, after TickTick's and Todoist's smart
 * dates: "daily", "every day", "every other week", "every 3 months",
 * "every mon, wed", "every weekday", "every 15th", "every last day",
 * "every 2nd tue", "every year". Todoist's "every!" means from completion, as
 * does a trailing "after completion" — TickTick's wording.
 *
 * `words` starts at the trigger word. Returns null unless the words that follow
 * really are a repeat, so "every time I forget" stays a title.
 */
export function parseRepeatPhrase(words: string[]): ParsedRepeatPhrase | null {
  if (!words.length) return null;
  const first = words[0].toLowerCase().replace(/[.,]$/, '');
  const simple: Record<string, RepeatFrequency> = { daily: 'daily', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly', annually: 'yearly' };
  if (simple[first]) {
    return { repeat: { rule: formatRepeatRule(emptyRule(simple[first], 1)), from: 'due' }, wordCount: 1 };
  }
  if (first !== 'every' && first !== 'every!') return null;

  let from: TaskRepeat['from'] = first === 'every!' ? 'completion' : 'due';
  let i = 1;
  const word = (index: number) => (words[index] ?? '').toLowerCase().replace(/,$/, '');
  let rule: RepeatRule | null = null;

  // "every 3 days", "every other week", "every day"
  let interval = 1;
  const countWord = word(i);
  if (/^\d{1,3}$/.test(countWord)) {
    interval = Number(countWord);
    i++;
  } else if (NUMBER_WORDS[countWord] !== undefined) {
    interval = NUMBER_WORDS[countWord];
    i++;
  }
  const unit = UNIT_WORDS[word(i)];
  if (unit && interval >= 1) {
    rule = emptyRule(unit, interval);
    i++;
  } else if (interval === 1) {
    const w = word(i);
    if (w === 'weekday' || w === 'weekdays' || w === 'workday' || w === 'workdays') {
      rule = emptyRule('weekly', 1);
      rule.byDay = WEEKDAYS_MO_FR.map((day) => ({ day: day }));
      i++;
    } else if (w === 'weekend' || w === 'weekends') {
      rule = emptyRule('weekly', 1);
      rule.byDay = [{ day: 6 }, { day: 0 }];
      i++;
    } else if (PHRASE_WEEKDAYS[w] !== undefined) {
      // "every mon, wed and fri"
      rule = emptyRule('weekly', 1);
      while (PHRASE_WEEKDAYS[word(i)] !== undefined || (word(i) === 'and' && PHRASE_WEEKDAYS[word(i + 1)] !== undefined)) {
        if (word(i) !== 'and') rule.byDay.push({ day: PHRASE_WEEKDAYS[word(i)] });
        i++;
      }
    } else if (w === 'last' && (word(i + 1) === 'day' || word(i + 1) === 'day of the month')) {
      rule = emptyRule('monthly', 1);
      rule.byMonthDay = [-1];
      i += 2;
    } else if (ordinalValue(w) !== null) {
      const nth = ordinalValue(w)!;
      const next = word(i + 1);
      if (PHRASE_WEEKDAYS[next] !== undefined) {
        // "every 2nd tue", "every last friday"
        if (nth > 5 || nth === 0) return null;
        rule = emptyRule('monthly', 1);
        rule.byDay = [{ day: PHRASE_WEEKDAYS[next], nth: nth }];
        i += 2;
      } else if (nth > 0 && nth <= 31) {
        // "every 15th"
        rule = emptyRule('monthly', 1);
        rule.byMonthDay = [nth];
        i++;
      }
    }
  }
  if (!rule) return null;

  // "every week on mon, fri" — weekdays after a weekly unit.
  if (rule.freq === 'weekly' && !rule.byDay.length && word(i) === 'on' && PHRASE_WEEKDAYS[word(i + 1)] !== undefined) {
    i++;
    while (PHRASE_WEEKDAYS[word(i)] !== undefined || (word(i) === 'and' && PHRASE_WEEKDAYS[word(i + 1)] !== undefined)) {
      if (word(i) !== 'and') rule.byDay.push({ day: PHRASE_WEEKDAYS[word(i)] });
      i++;
    }
  }
  if (word(i) === 'after' && (word(i + 1) === 'completion' || word(i + 1) === 'done')) {
    from = 'completion';
    i += 2;
  }
  return { repeat: { rule: formatRepeatRule(rule), from: from }, wordCount: i };
}

function emptyRule(freq: RepeatFrequency, interval: number): RepeatRule {
  return { freq: freq, interval: interval, byDay: [], byMonthDay: [], byMonth: [], bySetPos: [], skipWeekends: false };
}

export { DAY_CODES as REPEAT_DAY_CODES, WEEKDAY_SHORT as REPEAT_WEEKDAY_SHORT };

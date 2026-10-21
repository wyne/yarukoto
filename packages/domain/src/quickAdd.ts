import { Priority, TaskRepeat } from './types';
import { addDays, toISODate } from './dates';
import { firstOccurrenceOnOrAfter, parseRepeatPhrase } from './recurrence';

export interface ParsedQuickAdd {
  title: string;
  priority: Priority;
  dueDate?: string;
  dueTime?: string;
  tags: string[];
  /** Raw name from a ~list token, resolved to a list by the caller. */
  listName?: string;
  /** From "every …" — present only when one was typed. */
  repeat?: TaskRepeat;
}

/** What a recognized run of the input sets, for highlighting it where it was typed. */
export type QuickAddTokenKind = 'date' | 'time' | 'repeat' | 'tag' | 'list' | 'priority';

/** A run of the input, as `[start, end)` character offsets into it. */
export interface QuickAddRange {
  start: number;
  end: number;
}

/** A recognized run of the input. */
export interface QuickAddSpan extends QuickAddRange {
  kind: QuickAddTokenKind;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const PRIORITY_WORDS: Record<string, Priority> = {
  high: 'high',
  h: 'high',
  med: 'medium',
  medium: 'medium',
  m: 'medium',
  low: 'low',
  l: 'low',
  none: 'none',
};

function matchWeekday(word: string): number | null {
  const w = word.toLowerCase();
  // A prefix of the day's name, three letters or more: "thu", "thurs", "thursday".
  // Not the other way round, which read "monkey" and "satin" as days.
  const i = w.length >= 3 ? WEEKDAYS.findIndex((d) => d.startsWith(w)) : -1;
  return i === -1 ? null : i;
}

function nextWeekday(now: Date, targetDow: number): Date {
  const todayDow = now.getDay();
  let delta = targetDow - todayDow;
  if (delta < 0) delta += 7;
  return addDays(now, delta);
}

function matchTime(word: string): string | null {
  const m = word.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (m) {
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const suffix = m[3].toLowerCase();
    if (h === 12) h = 0;
    if (suffix === 'pm') h += 12;
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const m24 = word.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Parses input like "pay rent fri 6pm #home !high ~admin" into structured fields.
 * Unrecognized tokens are kept, in order, as the task title.
 *
 * Words inside a `literal` range are title text whatever they look like — how a
 * word the parser would take ("today", "#home") is kept as typed once the
 * person has said it isn't a token.
 */
export function parseQuickAdd(
  input: string,
  now: Date = new Date(),
  literal: readonly QuickAddRange[] = []
): ParsedQuickAdd {
  return scanQuickAdd(input, now, literal).parsed;
}

/**
 * Where each recognized token sits in `input`, in order — what the entry fields
 * tint. Every span is a run the parser took out of the title, so the highlight
 * and the created task can't disagree.
 */
export function quickAddSpans(
  input: string,
  now: Date = new Date(),
  literal: readonly QuickAddRange[] = []
): QuickAddSpan[] {
  return scanQuickAdd(input, now, literal).spans;
}

/**
 * Carries literal ranges across an edit from `prev` to `next`. A range before or
 * after the changed stretch moves with its text; one the edit touches is
 * dropped, since the word it covered is no longer the one that was kept.
 */
export function shiftLiteralRanges(prev: string, next: string, ranges: readonly QuickAddRange[]): QuickAddRange[] {
  if (ranges.length === 0 || prev === next) return [...ranges];
  let head = 0;
  const shorter = Math.min(prev.length, next.length);
  while (head < shorter && prev[head] === next[head]) head++;
  let tail = 0;
  while (tail < shorter - head && prev[prev.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
  const oldEnd = prev.length - tail;
  const newEnd = next.length - tail;
  const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
  const out: QuickAddRange[] = [];
  for (const r of ranges) {
    // Before the edit, unless what now follows it joins it into a longer word.
    if (r.end <= head && (r.end < head || isSpace(next[head]))) out.push(r);
    // After the edit, unless what now precedes it does the same.
    else if (r.start >= oldEnd && (r.start > oldEnd || isSpace(next[newEnd - 1]))) {
      const delta = newEnd - oldEnd;
      out.push({ start: r.start + delta, end: r.end + delta });
    }
  }
  return out;
}

function scanQuickAdd(
  input: string,
  now: Date,
  literal: readonly QuickAddRange[]
): { parsed: ParsedQuickAdd; spans: QuickAddSpan[] } {
  const words = Array.from(input.matchAll(/\S+/g), (m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }));
  const tokens = words.map((w) => w.text);
  // Words the person kept as plain text, which no rule below may take.
  const kept = words.map((w) => literal.some((r) => w.start >= r.start && w.end <= r.end));
  const spans: QuickAddSpan[] = [];
  const mark = (kind: QuickAddTokenKind, first: number, last = first) =>
    spans.push({ kind, start: words[first].start, end: words[last].end });
  const titleParts: string[] = [];
  const tags: string[] = [];
  let priority: Priority = 'none';
  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let listName: string | undefined;

  let repeat: TaskRepeat | undefined;

  for (let index = 0; index < tokens.length; index++) {
    const raw = tokens[index];
    if (kept[index]) {
      titleParts.push(raw);
      continue;
    }
    // "every mon, wed" — only behind "every", so a title like "weekly report"
    // keeps its words. The phrase parser refuses anything that isn't a repeat.
    if (!repeat && /^every!?$/i.test(raw)) {
      const phrase = parseRepeatPhrase(tokens.slice(index));
      if (phrase && !kept.slice(index, index + phrase.wordCount).some(Boolean)) {
        repeat = phrase.repeat;
        mark('repeat', index, index + phrase.wordCount - 1);
        index += phrase.wordCount - 1;
        continue;
      }
    }
    if (raw.startsWith('#') && raw.length > 1) {
      tags.push(raw.slice(1).toLowerCase());
      mark('tag', index);
      continue;
    }
    if (raw.startsWith('~') && raw.length > 1) {
      listName = raw.slice(1);
      mark('list', index);
      continue;
    }
    if (raw.startsWith('!') && raw.length > 1) {
      const p = PRIORITY_WORDS[raw.slice(1).toLowerCase()];
      if (p) {
        priority = p;
        mark('priority', index);
        continue;
      }
    }
    const lower = raw.toLowerCase();
    if (lower === 'today') {
      dueDate = toISODate(now);
      mark('date', index);
      continue;
    }
    if (lower === 'tomorrow' || lower === 'tmrw') {
      dueDate = toISODate(addDays(now, 1));
      mark('date', index);
      continue;
    }
    const dow = matchWeekday(lower);
    if (dow !== null) {
      dueDate = toISODate(nextWeekday(now, dow));
      mark('date', index);
      continue;
    }
    const time = matchTime(lower);
    if (time && (dueDate || repeat || tokens.some(
        (t, i) =>
          !kept[i] && (matchWeekday(t.toLowerCase()) !== null || ['today', 'tomorrow', 'tmrw'].includes(t.toLowerCase()))
      ))) {
      dueTime = time;
      mark('time', index);
      continue;
    }
    titleParts.push(raw);
  }

  // A repeat needs a date to count from: the first day it falls on, so
  // "every monday" typed on a Friday starts on Monday.
  if (repeat && !dueDate) dueDate = firstOccurrenceOnOrAfter(repeat, toISODate(now));

  const parsed: ParsedQuickAdd = {
    title: titleParts.join(' '),
    priority,
    dueDate,
    dueTime,
    tags,
    listName,
  };
  if (repeat) parsed.repeat = repeat;
  return { parsed, spans };
}

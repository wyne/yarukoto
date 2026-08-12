import { Priority } from './types';
import { addDays, toISODate } from './dateUtils';

export interface ParsedQuickAdd {
  title: string;
  priority: Priority;
  dueDate?: string;
  dueTime?: string;
  tags: string[];
  /** Raw name from a ~list token, resolved to a list by the caller. */
  listName?: string;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

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
  const i = WEEKDAYS.findIndex((d) => d === w || d === w.slice(0, 3));
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
 */
export function parseQuickAdd(input: string, now: Date = new Date()): ParsedQuickAdd {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const titleParts: string[] = [];
  const tags: string[] = [];
  let priority: Priority = 'none';
  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let listName: string | undefined;

  for (const raw of tokens) {
    if (raw.startsWith('#') && raw.length > 1) {
      tags.push(raw.slice(1).toLowerCase());
      continue;
    }
    if (raw.startsWith('~') && raw.length > 1) {
      listName = raw.slice(1);
      continue;
    }
    if (raw.startsWith('!') && raw.length > 1) {
      const p = PRIORITY_WORDS[raw.slice(1).toLowerCase()];
      if (p) {
        priority = p;
        continue;
      }
    }
    const lower = raw.toLowerCase();
    if (lower === 'today') {
      dueDate = toISODate(now);
      continue;
    }
    if (lower === 'tomorrow' || lower === 'tmrw') {
      dueDate = toISODate(addDays(now, 1));
      continue;
    }
    const dow = matchWeekday(lower);
    if (dow !== null) {
      dueDate = toISODate(nextWeekday(now, dow));
      continue;
    }
    const time = matchTime(lower);
    if (time && (dueDate || tokens.some((t) => matchWeekday(t.toLowerCase()) !== null || ['today', 'tomorrow', 'tmrw'].includes(t.toLowerCase())))) {
      dueTime = time;
      continue;
    }
    titleParts.push(raw);
  }

  return {
    title: titleParts.join(' '),
    priority,
    dueDate,
    dueTime,
    tags,
    listName,
  };
}

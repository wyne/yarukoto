/**
 * The calendar-day helpers the quick-add parser needs, shared so the server can
 * parse the same syntax the app does. Everything here works in the *process's*
 * local time — callers on the server pass a `now` whose local fields already
 * read as the user's wall clock (see `wallClockNow` in server/src/clock.ts).
 */

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Counted in calendar days, not in 24-hour blocks.
 *
 * A day is 23 or 25 hours across a daylight-saving change, so adding multiples
 * of DAY_MS drifts an hour either side of midnight and lands twice on the same
 * date: buildMonthGrid walks 42 days from one start, and a month spanning the
 * autumn change produced the 1st twice and dropped the last day — which React
 * saw as two children with the same key.
 */
export function addDays(d: Date, n: number): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' as local midnight — never `new Date(iso)`, which reads it as UTC. */
export function fromISODate(iso: string): Date {
  // Indexed rather than destructured: the app's Babel would compile a
  // destructure here to a runtime helper that cannot resolve from shared/.
  const parts = iso.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'nodate';

/**
 * Which stretch of time a due date falls in, relative to `now`.
 *
 * Shared because the app groups by these stretches and filters by them, and the
 * server evaluates saved filters with them: "overdue" has to mean one thing on
 * both sides, and two implementations would eventually disagree.
 */
export function dueBucket(dueDate: string | undefined, now: Date): DueBucket {
  if (!dueDate) return 'nodate';
  const diff = Math.round((startOfDay(fromISODate(dueDate)).getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'later';
}

/**
 * The user's wall clock, as a Date the shared date helpers can read.
 *
 * Those helpers (and `parseQuickAdd`) work in the process's local time, which is
 * right on a phone and wrong on a server: a Docker container usually runs in UTC,
 * so "today" at 9pm in New York would already be tomorrow. Instead of making every
 * helper timezone-aware, this builds a Date whose *local* fields read as the time
 * in `timeZone` — the only thing the helpers ever look at.
 *
 * The result is for calendar arithmetic only. Its absolute instant is meaningless,
 * so never store it or compare it against a real timestamp.
 */
export function wallClockNow(timeZone: string, now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

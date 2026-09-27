import { addDays, startOfDay, toISODate } from '../../../shared/dates';

export { addDays, startOfDay, toISODate };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Sunday-first, matching buildMonthGrid. */
export function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay());
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isBeforeDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() < startOfDay(b).getTime();
}

export function weekdayShort(d: Date): string {
  return WEEKDAY_SHORT[d.getDay()];
}

export function monthShort(d: Date): string {
  return MONTH_SHORT[d.getMonth()];
}

/**
 * Compact elapsed time for the sync indicator: 'now', '3m', '2h', '4d'.
 *
 * Deliberately coarse — the sidebar has room for a few characters, and knowing a
 * sync was "3m" ago is the useful part; the seconds never are.
 */
export function elapsedShort(now: Date, iso: string): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** The same value as a sentence, for places with room to spell it out. */
export function lastSyncedLabel(now: Date, iso?: string): string {
  if (!iso) return 'Not synced yet';
  const synced = new Date(iso);
  if (Number.isNaN(synced.getTime())) return 'Last synced';
  const time = synced.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const sameDay =
    synced.getFullYear() === now.getFullYear() &&
    synced.getMonth() === now.getMonth() &&
    synced.getDate() === now.getDate();
  const date = sameDay
    ? 'today'
    : synced.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: synced.getFullYear() === now.getFullYear() ? undefined : 'numeric',
      });
  const elapsed = elapsedShort(now, iso);
  const stamp = `Synced ${date} at ${time}`;
  return elapsed === 'now' ? stamp : `${stamp} · ${elapsed} ago`;
}

export function formatTime24to12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  let h = Number(hStr);
  const m = Number(mStr);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Fri, Aug 7 · 6:00 PM" style label used in the task detail Due row. */
export function formatDueFull(dueDate?: string, dueTime?: string): string {
  if (!dueDate) return 'None';
  const d = fromISODate(dueDate);
  const base = `${weekdayShort(d)}, ${monthShort(d)} ${d.getDate()}`;
  return dueTime ? `${base} · ${formatTime24to12(dueTime)}` : base;
}

/** "Yesterday", "Today", "Tomorrow", "Fri 6:00 PM", "Aug 5" — used in list rows. */
export function formatDueShort(now: Date, dueDate?: string, dueTime?: string): string | null {
  if (!dueDate) return null;
  const d = fromISODate(dueDate);
  const today = startOfDay(now);
  const diffDays = Math.round((startOfDay(d).getTime() - today.getTime()) / DAY_MS);

  let base: string;
  if (diffDays === 0) base = 'Today';
  else if (diffDays === -1) base = 'Yesterday';
  else if (diffDays === 1) base = 'Tomorrow';
  else if (diffDays > 1 && diffDays < 7) base = weekdayShort(d);
  else base = `${monthShort(d)} ${d.getDate()}`;

  if (dueTime) return `${base} ${formatTime24to12(dueTime)}`;
  return base;
}

/** "Aug 30 – Sep 5", or "Aug 3 – 9" when both ends are in the same month. */
export function dayRangeLabel(start: Date, end: Date): string {
  const tail = start.getMonth() === end.getMonth() ? `${end.getDate()}` : `${monthShort(end)} ${end.getDate()}`;
  return `${monthShort(start)} ${start.getDate()} – ${tail}`;
}

export function isOverdue(now: Date, task: { dueDate?: string; completed: boolean }): boolean {
  if (!task.dueDate || task.completed) return false;
  return isBeforeDay(fromISODate(task.dueDate), now);
}

/**
 * Days in a Sunday-first grid for the month containing `monthAnchor`, including
 * the leading/trailing days from adjacent months needed to fill the grid.
 *
 * Always six rows, even when the month fits in five and the last is entirely the
 * next month's. The grid reserves the height for six either way, so a short month
 * trimmed to five doesn't give that row back — it just leaves it empty.
 */
export function buildMonthGrid(monthAnchor: Date): { date: Date; inMonth: boolean }[] {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = addDays(first, -first.getDay());
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  return cells;
}

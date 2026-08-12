const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  return new Date(startOfDay(d).getTime() + n * DAY_MS);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Monday-first, matching buildMonthGrid. */
export function startOfWeek(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export function isOverdue(now: Date, task: { dueDate?: string; completed: boolean }): boolean {
  if (!task.dueDate || task.completed) return false;
  return isBeforeDay(fromISODate(task.dueDate), now);
}

export function reminderLabel(reminder: string): string {
  switch (reminder) {
    case 'at_time':
      return 'At time of due';
    case '30m':
      return '30 min before';
    case '1h':
      return '1 hour before';
    case '1d':
      return '1 day before';
    default:
      return 'None';
  }
}

/** Days in a Monday-first grid for the month containing `monthAnchor`, including
 * the leading/trailing days from adjacent months needed to fill the grid. */
export function buildMonthGrid(monthAnchor: Date): { date: Date; inMonth: boolean }[] {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const first = new Date(year, month, 1);
  // Monday = 0 ... Sunday = 6
  const firstWeekday = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -firstWeekday);
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  // Trim trailing rows that are entirely outside the month.
  while (cells.length > 35 && cells.slice(-7).every((c) => !c.inMonth)) {
    cells.splice(-7, 7);
  }
  return cells;
}

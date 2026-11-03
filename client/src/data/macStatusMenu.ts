import { BadgeCount, badgeNumber } from './badgeCount';
import { fromISODate, startOfDay } from './dateUtils';
import { tasksDueByToday } from './selectors';
import { Task } from './types';

/** How many tasks the menu bar extra lists, across both sections, before "N More…". */
export const STATUS_MENU_LIMIT = 8;

export interface StatusMenuSection {
  /** Overdue, or due today. */
  overdue: boolean;
  /** Every task in the section, listed or not; its header shows this. */
  total: number;
  tasks: { id: string; title: string }[];
  /** In the section but past its share of the limit. */
  more: number;
}

export interface StatusMenuContents {
  /**
   * Overdue, then Today, each left out when empty. With nothing due at all,
   * an empty Today, so the menu can say so.
   */
  sections: StatusMenuSection[];
  /** The number beside the icon, as the Badge count setting picks it. */
  count: number;
}

/**
 * What the Mac's menu bar extra and the Windows tray menu show: the Today
 * view's tasks in two sections, Overdue and Today, each headed by its own
 * total. Whatever the Badge count setting counts, the number beside the icon is
 * one of those headers or both added together, so it can always be found in
 * the menu.
 *
 * Overdue runs oldest first; within a day, timed tasks by time and then the
 * rest in their own order. Each section gets half the limit, and what one
 * doesn't use goes to the other, so a long overdue backlog can't push today
 * out of the menu.
 *
 * Built from `tasksDueByToday`, the same selector Today and its sidebar count
 * use.
 */
export function statusMenuContents(
  tasks: Task[],
  now: Date,
  setting: BadgeCount,
  limit = STATUS_MENU_LIMIT
): StatusMenuContents {
  const today = startOfDay(now).getTime();
  const due = tasksDueByToday(tasks, now)
    .map((task) => ({ task, day: startOfDay(fromISODate(task.dueDate!)).getTime() }))
    .sort(
      (a, b) =>
        a.day - b.day ||
        (a.task.dueTime ?? '￿').localeCompare(b.task.dueTime ?? '￿') ||
        a.task.order - b.task.order
    );
  const overdue = due.filter((d) => d.day < today).map((d) => d.task);
  const dueToday = due.filter((d) => d.day >= today).map((d) => d.task);

  const half = Math.floor(limit / 2);
  const overdueShown = Math.min(overdue.length, Math.max(half, limit - dueToday.length));
  const todayShown = Math.min(dueToday.length, limit - overdueShown);

  const section = (list: Task[], shown: number, isOverdue: boolean): StatusMenuSection => ({
    overdue: isOverdue,
    total: list.length,
    tasks: list.slice(0, shown).map((t) => ({ id: t.id, title: t.title })),
    more: list.length - shown,
  });
  const sections: StatusMenuSection[] = [];
  if (overdue.length > 0) sections.push(section(overdue, overdueShown, true));
  if (dueToday.length > 0 || overdue.length === 0) sections.push(section(dueToday, todayShown, false));

  return { sections, count: badgeNumber(setting, overdue.length, dueToday.length) };
}

import { fromISODate, startOfDay } from './dateUtils';
import { tasksDueByToday } from './selectors';
import { Task } from './types';

/** How many tasks the menu bar extra lists before "N More in Today…". */
export const STATUS_MENU_LIMIT = 8;

export interface StatusMenuContents {
  tasks: { id: string; title: string; overdue: boolean }[];
  /** Due by today but past the limit. */
  more: number;
  /** The number beside the icon: everything due by today. */
  count: number;
}

/**
 * What the Mac's menu bar extra shows: the Today view's tasks, oldest due date
 * first, so what is overdue leads; within a day, timed tasks by time and then
 * the rest in their own order.
 *
 * Built from `tasksDueByToday`, the same selector Today and its sidebar count
 * use, so the number beside the icon is the number beside Today.
 */
export function statusMenuContents(tasks: Task[], now: Date, limit = STATUS_MENU_LIMIT): StatusMenuContents {
  const today = startOfDay(now).getTime();
  const due = tasksDueByToday(tasks, now)
    .map((task) => ({ task, day: startOfDay(fromISODate(task.dueDate!)).getTime() }))
    .sort(
      (a, b) =>
        a.day - b.day ||
        (a.task.dueTime ?? '￿').localeCompare(b.task.dueTime ?? '￿') ||
        a.task.order - b.task.order
    );
  return {
    tasks: due.slice(0, limit).map(({ task, day }) => ({ id: task.id, title: task.title, overdue: day < today })),
    more: Math.max(0, due.length - limit),
    count: due.length,
  };
}

import { DueFilter, StatusFilter } from '../../data/taskFilter';

/**
 * The date wording is `dateBucket`'s own, so a task the calendar calls overdue
 * is filed under the same word here. "Next 7 days" reads as a stretch rather
 * than a boundary, which is what it is — tomorrow is inside it.
 *
 * No "Any time" row: an empty selection already says that, and offering it as a
 * sixth choice would make it a choice you could hold *alongside* the others.
 */
export const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'later', label: 'Later' },
  { value: 'nodate', label: 'No date' },
];

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'any', label: 'Any' },
];

/**
 * What the Due chip says.
 *
 * One choice reads as itself, several as a count — the same shape the list and
 * tag chips use, because "Overdue, No date" grows the chip past the width of
 * the row it scrolls in.
 */
export function dueLabel(values: DueFilter[]): string {
  if (values.length === 0) return 'Due';
  if (values.length > 1) return `${values.length} dates`;
  return DUE_OPTIONS.find((o) => o.value === values[0])?.label ?? 'Due';
}

export function statusLabel(value: StatusFilter): string {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? 'Active';
}

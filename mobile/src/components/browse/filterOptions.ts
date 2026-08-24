import { DueFilter, StatusFilter } from '../../data/taskFilter';

/**
 * Labels for the two single-choice filters.
 *
 * The date wording is `dateBucket`'s own, so a task the calendar calls overdue
 * is filed under the same word here. "Next 7 days" reads as a stretch rather
 * than a boundary, which is what it is — tomorrow is inside it.
 */
export const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
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

export function dueLabel(value: DueFilter): string {
  return DUE_OPTIONS.find((o) => o.value === value)?.label ?? 'Any time';
}

export function statusLabel(value: StatusFilter): string {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? 'Active';
}

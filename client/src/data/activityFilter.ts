/** What an activity entry records; a revision can expand into more than one. */
export type ActivityKind = 'create' | 'edit' | 'complete' | 'delete' | 'restore' | 'reopen';

/**
 * The quick filters above the activity list. Each undo-shaped kind rides with
 * the action it reverses, so "Deleted" still shows a delete that was restored.
 */
export type ActivityFilter = 'create' | 'edit' | 'complete' | 'delete';

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'create', label: 'Created' },
  { id: 'edit', label: 'Edited' },
  { id: 'complete', label: 'Completed' },
  { id: 'delete', label: 'Deleted' },
];

export function activityFilterOf(kind: ActivityKind): ActivityFilter {
  switch (kind) {
    case 'reopen':
      return 'complete';
    case 'restore':
      return 'delete';
    default:
      return kind;
  }
}

/** An empty selection means no filter, so the list is never blank by accident. */
export function matchesActivityFilter(kind: ActivityKind, selected: ReadonlySet<ActivityFilter>): boolean {
  return selected.size === 0 || selected.has(activityFilterOf(kind));
}

/** Toggles one filter; selecting the last unselected one is the same as "All". */
export function toggleActivityFilter(
  selected: ReadonlySet<ActivityFilter>,
  filter: ActivityFilter
): Set<ActivityFilter> {
  const next = new Set(selected);
  if (next.has(filter)) next.delete(filter);
  else next.add(filter);
  return next.size === ACTIVITY_FILTERS.length ? new Set() : next;
}

/**
 * Keyboard movement through a task list, as index arithmetic over the ids in
 * display order. Kept apart from the screen so it can be reasoned about — and
 * tested — without one.
 */

/**
 * The row an arrow key lands on. With no cursor yet, or one on a row that has
 * since left the view, ↓ starts at the top and ↑ at the bottom, as a Mac list
 * does when nothing is selected. Stops at either end rather than wrapping, so
 * a step of a page, or of the whole list, lands on the last row it can.
 */
export function stepCursor(ids: readonly string[], cursor: string | null, delta: number): string | null {
  if (ids.length === 0) return null;
  const at = cursor === null ? -1 : ids.indexOf(cursor);
  if (at === -1) return delta > 0 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
}

/** Every id from `a` to `b` inclusive, in display order whichever comes first. */
export function rangeBetween(ids: readonly string[], a: string, b: string): string[] {
  const from = ids.indexOf(a);
  const to = ids.indexOf(b);
  if (from === -1 || to === -1) return [];
  const [lo, hi] = from < to ? [from, to] : [to, from];
  return ids.slice(lo, hi + 1);
}

/**
 * A place the keyboard's cursor can rest: a task, or a folded group's header
 * (`taskId` null), which has no task on screen to stand on and would otherwise
 * be out of the keyboard's reach.
 */
export interface ListStop {
  taskId: string | null;
  groupKey: string;
}

/**
 * Every stop, in display order. A task listed twice — under two tags — is a stop
 * only where it is first shown, and a group with nothing in it is none.
 */
export function listStops(
  groups: readonly { key: string; tasks: readonly { id: string }[] }[],
  isFolded: (groupKey: string) => boolean
): ListStop[] {
  const seen = new Set<string>();
  const stops: ListStop[] = [];
  for (const group of groups) {
    if (group.tasks.length === 0) continue;
    if (isFolded(group.key)) {
      stops.push({ taskId: null, groupKey: group.key });
      continue;
    }
    for (const task of group.tasks) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      stops.push({ taskId: task.id, groupKey: group.key });
    }
  }
  return stops;
}

/** Where `stepCursor` would go, by index into the stops. -1 for nowhere. */
export function stepStop(stops: readonly ListStop[], at: number, delta: number): number {
  if (stops.length === 0) return -1;
  if (at < 0 || at >= stops.length) return delta > 0 ? 0 : stops.length - 1;
  return Math.min(stops.length - 1, Math.max(0, at + delta));
}

function groupStart(stops: readonly ListStop[], at: number): number {
  let start = at;
  while (start > 0 && stops[start - 1].groupKey === stops[at].groupKey) start--;
  return start;
}

/**
 * vim's `}` and `{`, with a group as the paragraph: forward to the first stop
 * of the next group, or the last stop when there is none; back to the start of
 * this group, or from its start to the start of the one before.
 */
export function groupStop(stops: readonly ListStop[], at: number, direction: 1 | -1): number {
  if (stops.length === 0) return -1;
  if (at < 0 || at >= stops.length) return direction > 0 ? 0 : groupStart(stops, stops.length - 1);
  if (direction > 0) {
    const next = stops.findIndex((stop, i) => i > at && stop.groupKey !== stops[at].groupKey);
    return next === -1 ? stops.length - 1 : next;
  }
  const start = groupStart(stops, at);
  return start < at || start === 0 ? start : groupStart(stops, start - 1);
}

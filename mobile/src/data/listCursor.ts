/**
 * Keyboard movement through a task list, as index arithmetic over the ids in
 * display order. Kept apart from the screen so it can be reasoned about — and
 * tested — without one.
 */

/**
 * The row an arrow key lands on. With no cursor yet, or one on a row that has
 * since left the view, ↓ starts at the top and ↑ at the bottom, as a Mac list
 * does when nothing is selected. Stops at either end rather than wrapping.
 */
export function stepCursor(ids: readonly string[], cursor: string | null, delta: 1 | -1): string | null {
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

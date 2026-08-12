export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function containsPoint(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

/**
 * Which drop target is under the pointer. Later registrations win, so a nested
 * target beats the container it sits in. Kept free of React and gesture code so
 * the fiddliest part of dragging can be reasoned about on its own.
 */
export function resolveDropTarget(targets: { id: string; rect: Rect | null }[], p: Point): string | null {
  let found: string | null = null;
  for (const t of targets) {
    if (t.rect && containsPoint(t.rect, p)) found = t.id;
  }
  return found;
}

/**
 * Drop target ids encode their destination — `month/day:2026-08-20`, later
 * `…/slot:…T09:00`.
 *
 * The scope matters: the Plan view shows the month grid above the day columns, so
 * the same date is a drop target on two surfaces at once. Ids are registry keys, so
 * without a scope the second registration silently replaces the first and one of the
 * two surfaces stops accepting drops.
 */
export const dayTargetId = (iso: string, scope: string): string => `${scope}/day:${iso}`;

export function isoFromDayTarget(id: string): string | null {
  const at = id.indexOf('/day:');
  return at === -1 ? null : id.slice(at + '/day:'.length);
}

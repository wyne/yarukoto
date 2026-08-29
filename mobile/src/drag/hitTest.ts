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
 * Which drop target is under the pointer. The smallest containing target wins,
 * so a row insertion zone beats the day column wrapped around it even when
 * React happens to register the parent later than its children.
 *
 * Takes the registry itself — any iterable of id/rect pairs, which a Map is —
 * rather than a list built for it. This runs on every pointer event, and the
 * list it used to be handed cost an object per target to build and discard.
 */
export function resolveDropTarget(
  targets: Iterable<[string, { rect: Rect | null }]>,
  p: Point
): string | null {
  let found: string | null = null;
  let foundArea = Infinity;
  for (const [id, target] of targets) {
    if (!target.rect || !containsPoint(target.rect, p)) continue;
    const area = target.rect.width * target.rect.height;
    if (area <= foundArea) {
      found = id;
      foundArea = area;
    }
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

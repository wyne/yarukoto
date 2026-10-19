/** Where the control that opened the popover sits, in window coordinates. */
export interface PopoverAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MARGIN = 8;
export const POPOVER_EDGE = 12;
const EDGE = POPOVER_EDGE;

/** Where a panel of a known size goes, in the coordinates of its bounds. */
export interface PopoverPlacement {
  left: number;
  top: number;
}

/**
 * Places a panel against its anchor so the whole of it lands inside the bounds.
 *
 * Below the anchor when the panel fits there, above it when it fits there
 * instead, and otherwise slid up from below until its bottom meets the edge —
 * the way a system menu opened near the bottom of a short window does. A panel
 * taller than the bounds keeps its top on screen, since that is where the first
 * items are.
 *
 * Deciding on the panel's real height is the point: a context menu is taller
 * than a fixed threshold guesses, and a guess is what let it open downward with
 * its last rows past the edge of the window.
 */
export function placePopover({
  anchor,
  width,
  height,
  bounds,
  align,
}: {
  anchor: PopoverAnchor;
  width: number;
  height: number;
  bounds: { width: number; height: number };
  align: 'start' | 'end';
}): PopoverPlacement {
  // Aligned to the requested edge, or to the other one when that would run past
  // the right of the bounds (a menu opened near the right edge opens leftward
  // from the pointer), then pulled back inside if even that would overflow.
  const fitsRight = anchor.x + width <= bounds.width - EDGE;
  const wanted = align === 'start' && fitsRight ? anchor.x : anchor.x + anchor.width - width;
  const left = Math.min(Math.max(EDGE, wanted), Math.max(EDGE, bounds.width - width - EDGE));

  const below = anchor.y + anchor.height + MARGIN;
  const above = anchor.y - MARGIN - height;
  let top: number;
  if (below + height <= bounds.height - EDGE) top = below;
  else if (above >= EDGE) top = above;
  else top = bounds.height - EDGE - height;
  return { left, top: Math.max(EDGE, top) };
}

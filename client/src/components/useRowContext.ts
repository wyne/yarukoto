import { useSidebar } from '../navigation/SidebarContext';
import { useWindowSelector } from './useWindowSelector';

/**
 * Below this a row has no room to spell out a list name beside a title, and the
 * tags go with it — a phone in portrait is always under it, a tablet never is.
 */
const CONTEXT_WIDTH = 600;

/**
 * How much of a task's context a row has room to show: see TaskRow's
 * `showContext`.
 *
 * The ladder is the same wherever rows appear, so it lives here rather than
 * being restated per screen. `reserved` is fixed furniture the surface adds that
 * a plain list row doesn't have — the calendar agenda's time column — which
 * comes off the width before it is judged, since those pixels are gone before
 * the title has had any.
 */
export function useRowContext(reserved = 0): true | 'tags' | 'count' {
  const { wide } = useSidebar();
  const roomy = useWindowSelector((window) => window.width - reserved >= CONTEXT_WIDTH);
  if (wide) return true;
  return roomy ? 'tags' : 'count';
}

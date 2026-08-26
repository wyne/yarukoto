import { useRef } from 'react';

/**
 * True from the first time `visible` is, and true thereafter.
 *
 * For the sheets and menus a screen owns. They are all written the same way —
 * always in the tree, told whether they are up — which means a screen builds
 * every one of them whether or not anything has asked for one. On the list
 * screen that is five sheets, a context menu and a composer, rebuilt on every
 * render of a screen that re-renders on every navigation.
 *
 * Latching rather than mirroring `visible`: a sheet has to survive its own
 * dismissal to animate out, and unmounting one the moment it closed would cut
 * that short. So the cost moves to the first open — a rarer, unhurried moment
 * with an animation of its own to hide behind — and is never paid again.
 */
export function useLazyMount(visible: boolean): boolean {
  const opened = useRef(false);
  if (visible) opened.current = true;
  return opened.current;
}

import { useWindowSelector } from '../components/useWindowSelector';

/**
 * The sizes View › Bigger and Smaller step through on the desktop, as multiples
 * of the size the app was drawn at.
 *
 * Phones have no steps of their own: they follow the system text size, which
 * reaches every `Text` through React Native's font scale. The desktop gets these
 * because nothing there does the same — the Mac app takes no text size from the
 * system, and the Windows and web builds set every size in pixels.
 */
export const TEXT_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75] as const;

/** One step bigger (`1`) or smaller (`-1`), or the same scale at either end. */
export function stepTextScale(scale: number, direction: 1 | -1): number {
  // A stored scale that isn't one of the steps snaps to the nearest one that
  // lies the asked-for way, so a step always moves.
  if (direction > 0) return TEXT_SCALES.find((s) => s > scale) ?? TEXT_SCALES[TEXT_SCALES.length - 1];
  return [...TEXT_SCALES].reverse().find((s) => s < scale) ?? TEXT_SCALES[0];
}

/** A stored scale, held to the range the steps cover. */
export function clampTextScale(scale: number): number {
  return Math.min(TEXT_SCALES[TEXT_SCALES.length - 1], Math.max(TEXT_SCALES[0], scale));
}

const SCALED_KEYS = ['fontSize', 'lineHeight'] as const;

/**
 * A stylesheet's styles with every font size and line height multiplied by
 * `scale`, and everything else as it was.
 *
 * Only type, as the system text size does it: padding, icons and borders keep
 * their size, so a bigger setting makes text easier to read without making the
 * window hold less of everything.
 */
export function scaleTextStyles<T extends Record<string, unknown>>(styles: T, scale: number): T {
  if (scale === 1) return styles;
  const out: Record<string, unknown> = {};
  for (const [name, style] of Object.entries(styles)) {
    if (!style || typeof style !== 'object') {
      out[name] = style;
      continue;
    }
    const next: Record<string, unknown> = { ...(style as Record<string, unknown>) };
    for (const key of SCALED_KEYS) {
      if (typeof next[key] === 'number') next[key] = Math.round((next[key] as number) * scale * 2) / 2;
    }
    out[name] = next;
  }
  return out as T;
}

/**
 * The system text size as React Native applies it: 1 at the default, more as the
 * user turns it up.
 *
 * iOS changes it while the app runs. React Native re-measures text when it does,
 * but not everything that was laid out around that text, so a view that has to
 * look right straight away keys itself on this and is rebuilt at the new size —
 * the same thing a relaunch would have done.
 */
export function useFontScale(): number {
  return useWindowSelector((window) => window.fontScale);
}

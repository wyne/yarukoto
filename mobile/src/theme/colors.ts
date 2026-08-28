// Yarukoto palette — dense & utilitarian, lifted 1:1 from the Claude Design handoff
// (project/Docket Mobile.dc.html — the original design file name).

/** What the user chose. `system` defers to the device. */
export type SchemePref = 'system' | 'light' | 'dark';
/** What that resolved to. Only ever one of two things. */
export type Scheme = 'light' | 'dark';

/**
 * An accent is stored as its own light-mode hex — that string *is* the saved
 * preference, validated against this tuple. Dark mode therefore adds a second
 * value beside each rather than replacing it, and an accent chosen before dark
 * mode existed keeps working untouched.
 */
export const ACCENT_OPTIONS = ['#2E52E0', '#1E7A3C', '#C2570A', '#6B21A8'] as const;
export type AccentColor = (typeof ACCENT_OPTIONS)[number];

export const DEFAULT_ACCENT: AccentColor = '#2E52E0';

/**
 * The same four accents, lifted for a dark surface.
 *
 * The light values are mid-dark by design — picked to carry against near-white.
 * On charcoal they sink, so each gains lightness and sheds a little saturation,
 * which is what keeps it reading as the same colour rather than a new one.
 */
export const ACCENT_DARK: Record<AccentColor, string> = {
  '#2E52E0': '#7D97F5',
  '#1E7A3C': '#5CBE7C',
  '#C2570A': '#E8944A',
  '#6B21A8': '#B47BE0',
};

/** Colours a list can be tagged with — the palette offered when picking one.
 *
 * Data rather than theme: the chosen hex is stored on the list record, so it is
 * the same colour on every device and in both schemes. Never remapped.
 */
export const LIST_COLORS = [
  '#2E62D9',
  '#0E8A8A',
  '#1E7A3C',
  '#DB8A00',
  '#C22B23',
  '#C2317F',
  '#8A5FD6',
  '#55554F',
] as const;

export const lightPalette = {
  screenBg: '#F4F4F1',
  canvasBg: '#E9E9E4',
  surface: '#FFFFFF',
  surfaceMuted: '#FBFBF9',
  border: '#E1E1DA',
  divider: '#EDEDE7',
  dividerStrong: '#DDDDD5',

  textPrimary: '#1A1A18',
  textSecondary: '#55554F',
  textTertiary: '#8A8A82',
  textFaint: '#B4B4AC',
  /** Body copy in the notes field — a shade off primary so it sits back. */
  textBody: '#35352F',

  ringNone: '#C6C6BE',
  chipBg: '#EEEEE8',

  priorityLow: '#2E62D9',
  priorityMedium: '#DB8A00',
  priorityHigh: '#C22B23',
  priorityHighBg: '#FBE3E1',

  success: '#1E7A3C',
  teal: '#0E8A8A',
  orange: '#C2570A',
  purple: '#8A5FD6',

  /**
   * Still the default accent's tint rather than the chosen one — pick purple and
   * a selected row stays blue. A standing bug, and the fix belongs at the call
   * sites as they convert, where the live accent is already in hand.
   */
  accentTintBg: '#E4EAFE',
  selectedRowBg: '#E9EEFD',

  /** Pointer resting on a row or menu item. Below selection, above the surface. */
  hoverBg: '#F2F2EE',
  /**
   * A row being held, while its context menu is open.
   *
   * Darker than the canvas rather than lighter, because it stands for a finger
   * on the row; the hover tint above goes the other way, and reading as "under
   * pressure" is the whole job. Deliberately not `selectedRowBg`, which already
   * means "this is the view you are looking at".
   */
  heldRowBg: '#DDDDD5',

  swipeLater: '#55554F',
  swipeDone: '#1E7A3C',

  /**
   * A surface painted in the text colour, carrying text painted in the
   * background — a toast, a tooltip, a count badge.
   *
   * Named, rather than spelled `textPrimary` with `'#fff'` on top, which is how
   * four places wrote it. That pairing inverts silently in dark, where
   * `textPrimary` is near-white: white on white, no error, nothing to notice.
   */
  inverseSurface: '#1A1A18',
  inverseText: '#FFFFFF',

  /**
   * Lift. A black drop shadow is how depth reads on a light surface and is
   * simply invisible on a dark one, so dark drops the shadow to nothing and
   * spends its depth on a lit rim instead.
   */
  shadow: '#000000',
  shadowOpacity: 0.18,
  /** Hairline around a lifted element, over whatever it floats above. */
  liftBorder: 'rgba(0, 0, 0, 0.07)',

  /**
   * The flat stand-in for Liquid Glass, where the real thing is unavailable.
   * Actual glass follows the system appearance by itself; this cannot.
   */
  glassFill: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.68)',

  /** Dimming behind a sheet or the nav drawer. */
  scrim: '#14140F',
  scrimOpacity: 0.4,
} as const;

/**
 * Every token the light palette has, so a gap in either side fails to compile.
 *
 * Widened off the `as const`, which would otherwise pin each token to its own
 * light-mode hex and make any dark value an error.
 */
type Widen<T> = T extends number ? number : T extends string ? string : T;
export type Palette = { [K in keyof typeof lightPalette]: Widen<(typeof lightPalette)[K]> };

/**
 * Warm charcoal, not neutral grey and not true black.
 *
 * The light palette is a warm off-white rather than white, and the mirror of
 * that is a warm dark — the same character seen from the other side. True black
 * would force heavier separation between cards to keep them apart, and gives
 * Liquid Glass nothing to refract.
 *
 * Surfaces get *lighter* as they come forward, which is the reverse of light
 * mode and the thing most worth holding on to when reading these: `surface`
 * sits above `screenBg` here, not below it.
 */
export const darkPalette: Palette = {
  screenBg: '#161614',
  canvasBg: '#0F0F0E',
  surface: '#212120',
  surfaceMuted: '#1B1B19',
  border: '#33322E',
  divider: '#282824',
  dividerStrong: '#3B3A35',

  textPrimary: '#F2F2EE',
  textSecondary: '#B4B4AC',
  textTertiary: '#8A8A82',
  textFaint: '#5E5D57',
  textBody: '#DCDCD6',

  ringNone: '#4A4944',
  chipBg: '#262622',

  priorityLow: '#6E97E8',
  priorityMedium: '#E0A33C',
  priorityHigh: '#E5675E',
  priorityHighBg: '#3A2320',

  success: '#5CBE7C',
  teal: '#3FB3B3',
  orange: '#E8944A',
  purple: '#A98AE0',

  accentTintBg: '#20263D',
  selectedRowBg: '#262E4A',

  hoverBg: '#232320',
  heldRowBg: '#33322E',

  swipeLater: '#6E6D66',
  swipeDone: '#2A6B41',

  inverseSurface: '#F2F2EE',
  inverseText: '#161614',

  // Zero opacity rather than a colour change: it leaves every existing shadow
  // declaration in place and harmless, so no call site has to learn about this.
  shadow: '#000000',
  shadowOpacity: 0,
  liftBorder: 'rgba(255, 255, 255, 0.14)',

  glassFill: 'rgba(38, 38, 34, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.16)',

  scrim: '#000000',
  scrimOpacity: 0.55,
};

export const palettes = { light: lightPalette, dark: darkPalette } as const;

export function priorityColor(
  priority: 'none' | 'low' | 'medium' | 'high',
  palette: Palette = lightPalette
): string {
  switch (priority) {
    case 'low':
      return palette.priorityLow;
    case 'medium':
      return palette.priorityMedium;
    case 'high':
      return palette.priorityHigh;
    default:
      return palette.ringNone;
  }
}

/** Fades a six-digit hex colour into an rgba() string for runtime accent tints. */
export function alpha(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

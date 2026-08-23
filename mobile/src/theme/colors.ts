// Yarukoto palette — dense & utilitarian, lifted 1:1 from the Claude Design handoff
// (project/Docket Mobile.dc.html — the original design file name). Accent is the one themeable value.

export const ACCENT_OPTIONS = ['#2E52E0', '#1E7A3C', '#C2570A', '#6B21A8'] as const;
export type AccentColor = (typeof ACCENT_OPTIONS)[number];

export const DEFAULT_ACCENT: AccentColor = '#2E52E0';

/** Colours a list can be tagged with — the palette offered when picking a list colour. */
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

export const colors = {
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

  ringNone: '#C6C6BE',
  chipBg: '#EEEEE8',

  priorityLow: '#2E62D9',
  priorityMedium: '#DB8A00',
  priorityHigh: '#C22B23',
  priorityHighBg: '#FBE3E1',

  success: '#1E7A3C',
  purple: '#8A5FD6',

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
} as const;

export function priorityColor(priority: 'none' | 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'low':
      return colors.priorityLow;
    case 'medium':
      return colors.priorityMedium;
    case 'high':
      return colors.priorityHigh;
    default:
      return colors.ringNone;
  }
}

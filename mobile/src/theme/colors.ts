// Yarukoto palette — dense & utilitarian, lifted 1:1 from the Claude Design handoff
// (project/Docket Mobile.dc.html — the original design file name). Accent is the one themeable value.

export const ACCENT_OPTIONS = ['#2E52E0', '#1E7A3C', '#C2570A', '#6B21A8'] as const;
export type AccentColor = (typeof ACCENT_OPTIONS)[number];

export const DEFAULT_ACCENT: AccentColor = '#2E52E0';

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

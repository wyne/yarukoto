/**
 * What the number on the app icon and beside the menu bar icon counts: what is
 * due by today, only what is overdue, or nothing. One setting for every place
 * the number shows, so they never disagree.
 */
export type BadgeCount = 'today' | 'overdue' | 'off';
export const BADGE_COUNT_OPTIONS: BadgeCount[] = ['today', 'overdue', 'off'];

/** The number to show, from how many tasks are overdue and how many are due today. */
export function badgeNumber(setting: BadgeCount, overdue: number, today: number): number {
  switch (setting) {
    case 'today':
      return overdue + today;
    case 'overdue':
      return overdue;
    case 'off':
      return 0;
  }
}

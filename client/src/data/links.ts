import { Linking } from 'react-native';

/**
 * Where the app sends someone for help, in one place so the connect screen,
 * Settings and the Mac's Help menu can't point at different pages.
 *
 * The docs site is built from docs/ in this repo; the privacy policy lives on
 * the landing site (wyne/yarukoto-landing), which the stores link to as well.
 */
const DOCS = 'https://docs.yarukotoapp.com';

export const LINKS = {
  /** The introduction, which leads to the Docker and Synology guides. */
  setupGuide: `${DOCS}/`,
  /** Using the apps: signing in, household, reminders. */
  appGuide: `${DOCS}/using/apps/`,
  /** GitHub issues and the support email. */
  support: `${DOCS}/using/support/`,
  privacy: 'https://yarukotoapp.com/privacy.html',
} as const;

/**
 * Opens a link in the system browser. On the web that is a new tab, and the
 * Windows shell hands a new window to the default browser.
 */
export function openLink(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

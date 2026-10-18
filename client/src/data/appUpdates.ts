import Constants from 'expo-constants';
import { confirmAsync, notify } from './confirm';
import { openLink } from './links';
import { DESKTOP_APP, MAC, WINDOWS_APP } from './platform';

/**
 * GitHub only marks this release latest after the desktop workflow has attached
 * both installers. Its JSON response is the update manifest: one version and a
 * named set of immutable, tag-specific downloads.
 *
 * Using the API rather than fetching a `releases/latest/download/*.json` asset
 * matters on Windows. api.github.com permits browser/WebView fetches; GitHub's
 * release-download redirect does not expose CORS headers.
 */
export const UPDATE_MANIFEST_URL = 'https://api.github.com/repos/wyne/yarukoto/releases/latest';

const DOWNLOAD_NAMES = {
  mac: 'Yarukoto-mac.dmg',
  windows: 'Yarukoto-windows-setup.exe',
} as const;

const CHECK_TIMEOUT_MS = 15_000;

export const APP_VERSION = Constants.expoConfig?.version ?? null;

export type DesktopPlatform = 'mac' | 'windows';

export interface UpdateManifest {
  version: string;
  notesUrl: string;
  downloadUrl: string;
}

export type UpdateCheckResult =
  | { status: 'current'; currentVersion: string; latestVersion: string }
  | { status: 'available'; currentVersion: string; manifest: UpdateManifest };

interface GitHubAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

interface GitHubRelease {
  tag_name?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
}

function versionParts(version: string): [number, number, number] | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) return null;
  return parts as [number, number, number];
}

/** Positive when `left` is newer, negative when `right` is, null if invalid. */
export function compareAppVersions(left: string, right: string): number | null {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return null;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function safeGithubUrl(value: unknown, kind: 'release' | 'download'): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
    const prefix = kind === 'release' ? '/wyne/yarukoto/releases/tag/' : '/wyne/yarukoto/releases/download/';
    return url.pathname.startsWith(prefix) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Validates the small part of GitHub's release response the app trusts. */
export function parseUpdateManifest(input: unknown, platform: DesktopPlatform): UpdateManifest {
  const release = input as GitHubRelease | null;
  const tag = typeof release?.tag_name === 'string' ? release.tag_name : '';
  const parts = versionParts(tag);
  const notesUrl = safeGithubUrl(release?.html_url, 'release');
  if (!parts || !notesUrl || release?.draft === true || release?.prerelease === true || !Array.isArray(release?.assets)) {
    throw new Error('The latest release is not a usable desktop release.');
  }

  const expected = DOWNLOAD_NAMES[platform];
  const asset = (release.assets as GitHubAsset[]).find((candidate) => candidate?.name === expected);
  const downloadUrl = safeGithubUrl(asset?.browser_download_url, 'download');
  if (!downloadUrl) throw new Error(`The latest release does not include ${expected}.`);

  return {
    version: parts.join('.'),
    notesUrl,
    downloadUrl,
  };
}

export function currentDesktopPlatform(): DesktopPlatform | null {
  if (MAC) return 'mac';
  if (WINDOWS_APP) return 'windows';
  return null;
}

export async function checkForAppUpdate(
  platform: DesktopPlatform,
  currentVersion: string | null = APP_VERSION,
  fetcher: typeof fetch = fetch
): Promise<UpdateCheckResult> {
  if (!currentVersion || !versionParts(currentVersion)) {
    throw new Error(`This app has an invalid version: ${currentVersion ?? 'unknown'}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetcher(UPDATE_MANIFEST_URL, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The update service returned ${response.status}.`);
    const manifest = parseUpdateManifest(await response.json(), platform);
    const comparison = compareAppVersions(manifest.version, currentVersion);
    if (comparison === null) throw new Error('The update service returned an invalid version.');
    return comparison > 0
      ? { status: 'available', currentVersion, manifest }
      : { status: 'current', currentVersion, latestVersion: manifest.version };
  } finally {
    clearTimeout(timeout);
  }
}

function isConnectivityError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
}

async function offerUpdate(manifest: UpdateManifest): Promise<void> {
  const message = `Yarukoto ${manifest.version} is available. View the release notes and choose the installer to update this copy.`;
  if (await confirmAsync('Update available', message, 'View release')) openLink(manifest.notesUrl);
}

let interactiveCheck: Promise<void> | null = null;

/** Runs one user-requested check and presents its result on the current desktop. */
export function checkForAppUpdatesInteractively(): Promise<void> {
  if (interactiveCheck) return interactiveCheck;
  interactiveCheck = (async () => {
    const platform = currentDesktopPlatform();
    if (!DESKTOP_APP || !platform) return;
    try {
      const result = await checkForAppUpdate(platform);
      if (result.status === 'available') await offerUpdate(result.manifest);
      else notify('Yarukoto is up to date', `You have the latest version, ${result.currentVersion}.`);
    } catch (error) {
      notify(
        'Couldn’t check for updates',
        isConnectivityError(error)
          ? 'Check your internet connection and try again.'
          : 'Yarukoto couldn’t read the latest release. Try again later.'
      );
    }
  })().finally(() => {
    interactiveCheck = null;
  });
  return interactiveCheck;
}

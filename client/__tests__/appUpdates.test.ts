import {
  UPDATE_MANIFEST_URL,
  checkForAppUpdate,
  compareAppVersions,
  parseUpdateManifest,
} from '../src/data/appUpdates';

const release = {
  tag_name: 'v1.4.2',
  html_url: 'https://github.com/wyne/yarukoto/releases/tag/v1.4.2',
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'Yarukoto-mac.dmg',
      browser_download_url: 'https://github.com/wyne/yarukoto/releases/download/v1.4.2/Yarukoto-mac.dmg',
    },
    {
      name: 'Yarukoto-windows-setup.exe',
      browser_download_url: 'https://github.com/wyne/yarukoto/releases/download/v1.4.2/Yarukoto-windows-setup.exe',
    },
  ],
};

describe('desktop app versions', () => {
  test('compares all three SemVer components', () => {
    expect(compareAppVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareAppVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareAppVersions('1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(compareAppVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareAppVersions('1.2.2', '1.2.3')).toBeLessThan(0);
  });

  test('rejects versions outside the release workflow format', () => {
    expect(compareAppVersions('1.2', '1.2.0')).toBeNull();
    expect(compareAppVersions('1.2.3-beta.1', '1.2.3')).toBeNull();
    expect(compareAppVersions('01.2.3', '1.2.3')).toBeNull();
  });
});

describe('the GitHub release manifest', () => {
  test('selects the installer for the current desktop', () => {
    expect(parseUpdateManifest(release, 'mac')).toEqual({
      version: '1.4.2',
      notesUrl: release.html_url,
      downloadUrl: release.assets[0].browser_download_url,
    });
    expect(parseUpdateManifest(release, 'windows').downloadUrl).toBe(release.assets[1].browser_download_url);
  });

  test('rejects incomplete and untrusted releases', () => {
    expect(() => parseUpdateManifest({ ...release, prerelease: true }, 'mac')).toThrow();
    expect(() => parseUpdateManifest({ ...release, assets: [] }, 'windows')).toThrow(/setup/);
    expect(() =>
      parseUpdateManifest(
        {
          ...release,
          assets: [{ ...release.assets[0], browser_download_url: 'https://example.com/Yarukoto-mac.dmg' }],
        },
        'mac'
      )
    ).toThrow();
  });
});

describe('checking for an update', () => {
  const response = (body: unknown, ok = true) =>
    jest.fn(async (url: string) => {
      expect(url).toBe(UPDATE_MANIFEST_URL);
      return { ok, status: ok ? 200 : 503, json: async () => body };
    }) as unknown as typeof fetch;

  test('reports a newer release and its platform download', async () => {
    await expect(checkForAppUpdate('windows', '1.4.1', response(release))).resolves.toMatchObject({
      status: 'available',
      currentVersion: '1.4.1',
      manifest: { version: '1.4.2', downloadUrl: release.assets[1].browser_download_url },
    });
  });

  test('treats equal or older releases as current', async () => {
    await expect(checkForAppUpdate('mac', '1.4.2', response(release))).resolves.toEqual({
      status: 'current',
      currentVersion: '1.4.2',
      latestVersion: '1.4.2',
    });
    await expect(checkForAppUpdate('mac', '2.0.0', response(release))).resolves.toMatchObject({ status: 'current' });
  });

  test('fails closed when the service does not return a release', async () => {
    await expect(checkForAppUpdate('mac', '1.4.1', response({}, false))).rejects.toThrow('503');
  });
});

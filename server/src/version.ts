import fs from 'node:fs';
import path from 'node:path';

/**
 * package.json sits next to the source in dev (`src/version.ts`) and three levels
 * up from the compiled file in the image (`dist/server/src/version.js`), so both
 * are tried rather than assuming one layout.
 */
function packageVersion(): string {
  const candidates = [
    path.resolve(__dirname, '../package.json'),
    path.resolve(__dirname, '../../../package.json'),
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof parsed.version === 'string') return parsed.version;
    } catch {
      // Try the next candidate; a missing version is not worth failing startup over.
    }
  }
  return '0.0.0';
}

const commit = process.env.GIT_SHA?.trim() || null;

/**
 * What's actually running. The commit is baked in at image build time — without it
 * `version` alone can't distinguish two builds off the same package.json, which is
 * exactly the case when tracking `latest`.
 */
export const buildInfo = {
  version: packageVersion(),
  commit,
  commitShort: commit ? commit.slice(0, 7) : null,
  builtAt: process.env.BUILD_TIME?.trim() || null,
};

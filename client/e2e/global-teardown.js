const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

module.exports = async function globalTeardown() {
  const stateDir = process.env.YARUKOTO_E2E_STATE_DIR;
  if (!stateDir) return;

  const expectedParent = fs.realpathSync(os.tmpdir());
  const parent = fs.realpathSync(path.dirname(stateDir));
  if (parent !== expectedParent || !path.basename(stateDir).startsWith('yarukoto-web-e2e-')) {
    throw new Error(`Refusing to remove unexpected end-to-end state directory: ${stateDir}`);
  }
  fs.rmSync(stateDir, { force: true, recursive: true });
};

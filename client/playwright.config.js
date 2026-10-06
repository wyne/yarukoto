const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { defineConfig } = require('@playwright/test');

const port = Number(process.env.YARUKOTO_E2E_PORT ?? 18081);
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yarukoto-web-e2e-'));
process.env.YARUKOTO_E2E_STATE_DIR = stateDir;

module.exports = defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  globalTeardown: require.resolve('./e2e/global-teardown'),
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start --prefix ../server',
    url: `http://127.0.0.1:${port}/api/v1/health`,
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      YARUKOTO_TOKEN: 'e2e-token',
      PORT: String(port),
      DATABASE_PATH: path.join(stateDir, 'yarukoto.db'),
      BACKUP_INTERVAL_HOURS: '0',
      LOG_LEVEL: 'warn',
      MIGRATIONS_DIR: path.resolve(__dirname, '../server/migrations'),
      WEB_ROOT: path.resolve(__dirname, 'dist-e2e'),
    },
  },
});

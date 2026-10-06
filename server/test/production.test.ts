import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SERVER_ROOT = path.resolve(__dirname, '..');
const ENTRYPOINT = path.join(SERVER_ROOT, 'dist/server/src/index.js');

async function availablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForHealth(url: string, childExited: Promise<Error>): Promise<Response> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await Promise.race([
      fetch(`${url}/api/v1/health`).catch(() => null),
      childExited,
    ]);
    if (response instanceof Error) throw response;
    if (response?.ok) return response;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('compiled server did not become healthy within 10 seconds');
}

test('the compiled production server boots, migrates, serves the web app, and syncs', async (t) => {
  assert.ok(fs.existsSync(ENTRYPOINT), `missing compiled entrypoint: ${ENTRYPOINT}`);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yarukoto-production-test-'));
  const webRoot = path.join(stateDir, 'web');
  fs.mkdirSync(webRoot);
  fs.writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>production bootstrap fixture</title>');

  const port = await availablePort();
  const child = spawn(process.execPath, [ENTRYPOINT], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      YARUKOTO_TOKEN: 'production-test-token',
      PORT: String(port),
      DATABASE_PATH: path.join(stateDir, 'yarukoto.db'),
      BACKUP_INTERVAL_HOURS: '0',
      LOG_LEVEL: 'silent',
      MIGRATIONS_DIR: path.join(SERVER_ROOT, 'migrations'),
      WEB_ROOT: webRoot,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (stderr += chunk));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await exited;
    }
    fs.rmSync(stateDir, { force: true, recursive: true });
  });

  const childExited = new Promise<Error>((resolve) => {
    child.once('exit', (code, signal) => resolve(new Error(`compiled server exited early (${code ?? signal}): ${stderr}`)));
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForHealth(baseUrl, childExited);
  assert.equal((await health.json()).ok, true);

  const spa = await fetch(`${baseUrl}/today`);
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /production bootstrap fixture/);

  const missingApi = await fetch(`${baseUrl}/api/v1/not-a-route`);
  assert.equal(missingApi.status, 404);
  assert.deepEqual(await missingApi.json(), { error: 'not_found' });

  const sync = await fetch(`${baseUrl}/api/v1/sync`, {
    headers: { Authorization: 'Bearer production-test-token' },
  });
  assert.equal(sync.status, 200);
  const body = await sync.json();
  assert.deepEqual(body.tasks, []);
  assert.ok(fs.existsSync(path.join(stateDir, 'yarukoto.db')));
});

test('the compiled production server fails fast without an access token', async () => {
  assert.ok(fs.existsSync(ENTRYPOINT), `missing compiled entrypoint: ${ENTRYPOINT}`);
  const env = { ...process.env };
  delete env.YARUKOTO_TOKEN;
  delete env.YARUKOTO_TOKEN_FILE;

  const child = spawn(process.execPath, [ENTRYPOINT], {
    cwd: SERVER_ROOT,
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const code = await new Promise<number | null>((resolve) => child.once('exit', resolve));
  assert.notEqual(code, 0);
  assert.match(stderr, /Missing required env var YARUKOTO_TOKEN/);
});

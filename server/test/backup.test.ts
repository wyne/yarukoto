import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db';
import { backupFileName, listBackups, runBackup } from '../src/backup';
import { fromEnvOrFile, parseTrustProxy } from '../src/env';
import { registerBackupRoutes } from '../src/routes/backup';
import { OWNER_VIEWER } from '../src/access';
import { approvePairing, pollPairing, startPairing } from '../src/household';
import { authedApp, OWNER_AUTH } from './helpers';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yarukoto-test-'));
}

/** A file-backed database in WAL mode, as the server opens it, with one list in it. */
function liveDb(dir: string): Database.Database {
  const db = new Database(path.join(dir, 'live.db'));
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  db.prepare("INSERT INTO lists (id, name, color, updated_at) VALUES ('l1', 'Groceries', '#888', 'x')").run();
  return db;
}

test('backup file names sort by time and contain no colons', () => {
  const name = backupFileName(new Date('2026-10-02T03:04:05.678Z'));
  assert.equal(name, 'yarukoto-2026-10-02T03-04-05Z.db');
});

test('runBackup writes a readable copy, including writes still in the WAL, and prunes old ones', async () => {
  const dir = tempDir();
  const db = liveDb(dir);
  const backups = path.join(dir, 'backups');

  for (let i = 0; i < 4; i++) {
    await runBackup(db, backups, 2, new Date(Date.UTC(2026, 9, 1 + i)));
  }
  fs.writeFileSync(path.join(backups, 'notes.txt'), 'mine');

  assert.deepEqual(listBackups(backups), ['yarukoto-2026-10-03T00-00-00Z.db', 'yarukoto-2026-10-04T00-00-00Z.db']);
  assert.ok(fs.existsSync(path.join(backups, 'notes.txt')), 'pruning leaves files it did not write');
  assert.ok(!fs.readdirSync(backups).some((f) => f.endsWith('.partial')));

  const copy = new Database(path.join(backups, 'yarukoto-2026-10-04T00-00-00Z.db'), { readonly: true });
  assert.deepEqual(copy.prepare('SELECT name FROM lists').all(), [{ name: 'Groceries' }]);
  copy.close();
  db.close();
});

test('GET /api/v1/backup downloads a snapshot for an admin and refuses everyone else', async () => {
  const dir = tempDir();
  const db = liveDb(dir);
  const app = authedApp(db);
  registerBackupRoutes(app, db);
  await app.ready();

  const ok = await app.inject({ method: 'GET', url: '/api/v1/backup', headers: OWNER_AUTH });
  assert.equal(ok.statusCode, 200);
  assert.match(String(ok.headers['content-disposition']), /attachment; filename="yarukoto-.*\.db"/);
  const file = path.join(dir, 'download.db');
  fs.writeFileSync(file, ok.rawPayload);
  const copy = new Database(file, { readonly: true });
  assert.deepEqual(copy.prepare('SELECT name FROM lists').all(), [{ name: 'Groceries' }]);
  copy.close();

  const started = startPairing(db, 'Phone');
  approvePairing(db, OWNER_VIEWER, started.code, { as: 'member', name: 'Sam' });
  const polled = pollPairing(db, started.pairingId, started.secret);
  assert.equal(polled.status, 'approved');
  const member = await app.inject({
    method: 'GET',
    url: '/api/v1/backup',
    headers: { authorization: `Bearer ${polled.status === 'approved' ? polled.token : ''}` },
  });
  assert.equal(member.statusCode, 403);

  await app.close();
  db.close();
});

test('fromEnvOrFile reads NAME_FILE, trims it, and refuses both at once', () => {
  const dir = tempDir();
  const secret = path.join(dir, 'token');
  fs.writeFileSync(secret, 'from-a-file\n');

  assert.equal(fromEnvOrFile('X', { X: 'plain' }), 'plain');
  assert.equal(fromEnvOrFile('X', { X_FILE: secret }), 'from-a-file');
  assert.equal(fromEnvOrFile('X', {}), undefined);
  assert.throws(() => fromEnvOrFile('X', { X: 'plain', X_FILE: secret }), /not both/);
});

test('parseTrustProxy is off by default and accepts true, hop counts and address lists', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('172.16.0.0/12, 127.0.0.1'), '172.16.0.0/12, 127.0.0.1');
});

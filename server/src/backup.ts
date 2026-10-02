import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from './env';

const PREFIX = 'yarukoto-';
const SUFFIX = '.db';

/** `yarukoto-2026-10-02T03-00-00Z.db`: sorts by time, and is legal on every filesystem. */
export function backupFileName(now = new Date()): string {
  return `${PREFIX}${now.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-')}${SUFFIX}`;
}

/**
 * Writes a consistent copy of the live database to `file`.
 *
 * This is SQLite's online backup API run by the process that already holds the
 * database, which is what makes it safe here when an outside `sqlite3 .backup`
 * is not: the WAL's shared-memory file doesn't work across a Docker bind mount,
 * so only this process sees every committed write. The copy lands under a
 * temporary name and is renamed into place, so a crash mid-backup never leaves
 * a truncated file that looks like a good one.
 */
export async function backupTo(db: Database.Database, file: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.partial`;
  try {
    await db.backup(partial);
    fs.renameSync(partial, file);
  } finally {
    fs.rmSync(partial, { force: true });
  }
}

/** Snapshot files in `dir`, oldest first. */
export function listBackups(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .sort();
}

/** Deletes all but the newest `keep` snapshots. Leaves anything it didn't write alone. */
export function pruneBackups(dir: string, keep: number): void {
  const files = listBackups(dir);
  for (const name of files.slice(0, Math.max(0, files.length - keep))) {
    fs.rmSync(path.join(dir, name), { force: true });
  }
}

export async function runBackup(db: Database.Database, dir: string, keep: number, now = new Date()): Promise<string> {
  const file = path.join(dir, backupFileName(now));
  await backupTo(db, file);
  pruneBackups(dir, keep);
  return file;
}

/**
 * Snapshots the database into `BACKUP_DIR` every `BACKUP_INTERVAL_HOURS`,
 * keeping the newest `BACKUP_KEEP`. The first one runs shortly after startup,
 * so a fresh install — or one restarted to pick up an update — has a copy
 * without waiting a full interval.
 */
export function scheduleBackups(db: Database.Database, log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }): void {
  if (env.backupIntervalHours <= 0 || env.backupKeep <= 0) return;
  const run = () =>
    runBackup(db, env.backupDir, env.backupKeep).then(
      (file) => log.info({ file }, 'Database backed up'),
      (err) => log.error({ err, dir: env.backupDir }, 'Database backup failed')
    );
  setTimeout(run, 60_000).unref();
  setInterval(run, env.backupIntervalHours * 60 * 60 * 1000).unref();
}

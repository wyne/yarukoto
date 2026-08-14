import Database from 'better-sqlite3';
import { env } from './env';

/** Hard-deletes trashed tasks past the retention window, and prunes their revisions. */
export function runRetention(db: Database.Database): void {
  const cutoff = new Date(Date.now() - env.trashRetentionDays * 24 * 60 * 60 * 1000).toISOString();

  const run = db.transaction(() => {
    const expired = db.prepare('SELECT id FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff) as {
      id: string;
    }[];
    for (const { id } of expired) {
      db.prepare('DELETE FROM task_revisions WHERE task_id = ?').run(id);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    }
    db.prepare('DELETE FROM lists WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
    db.prepare('DELETE FROM folders WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
    db.prepare('DELETE FROM view_prefs WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
  });
  run();
}

export function scheduleRetention(db: Database.Database): void {
  runRetention(db);
  const oneDayMs = 24 * 60 * 60 * 1000;
  setInterval(() => runRetention(db), oneDayMs).unref();
}

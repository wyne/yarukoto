import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export const env = {
  token: required('YARUKOTO_TOKEN'),
  port: Number(process.env.PORT ?? 8080),
  databasePath: process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data/yarukoto.db'),
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS ?? 30),
  historyRevisionsPerTask: Number(process.env.HISTORY_REVISIONS_PER_TASK ?? 50),
  webRoot: process.env.WEB_ROOT ?? path.resolve(process.cwd(), '../web'),
  /**
   * IANA zone the task API and MCP tools resolve "today", "fri" and "6pm" in.
   * The container's own zone is usually UTC, which is nobody's wall clock.
   */
  timeZone: process.env.YARUKOTO_TZ ?? process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  migrationsDir: process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'migrations'),
};

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
  migrationsDir: process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'migrations'),
};

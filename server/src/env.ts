import fs from 'node:fs';
import path from 'node:path';

/**
 * `NAME`, or the contents of the file `NAME_FILE` points at — the convention
 * Docker and Compose secrets use, so a token can live in `/run/secrets/…`
 * rather than in the environment. Setting both is a mistake worth refusing.
 */
export function fromEnvOrFile(name: string, source: NodeJS.ProcessEnv = process.env): string | undefined {
  const file = source[`${name}_FILE`];
  if (file && source[name]) throw new Error(`Set ${name} or ${name}_FILE, not both`);
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return source[name];
}

function required(name: string): string {
  const value = fromEnvOrFile(name);
  if (!value) throw new Error(`Missing required env var ${name} (or ${name}_FILE)`);
  return value;
}

/**
 * Fastify's `trustProxy`: off unless asked, because trusting `X-Forwarded-For`
 * from anyone lets a client claim any address. `true` trusts every hop, anything
 * else is a comma-separated list of proxy addresses or CIDRs.
 *
 * A bare hop count ("1") used to be accepted too. Fastify now treats one as
 * "trust nothing", since a count can't tell a proxy from a client that sent
 * enough headers, so it is read as off here rather than as an address.
 */
export function parseTrustProxy(value: string | undefined): boolean | string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'false' || /^\d+$/.test(trimmed)) return false;
  if (trimmed === 'true') return true;
  return trimmed;
}

const databasePath = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data/yarukoto.db');

export const env = {
  token: required('YARUKOTO_TOKEN'),
  port: Number(process.env.PORT ?? 8080),
  databasePath,
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS ?? 30),
  historyRevisionsPerTask: Number(process.env.HISTORY_REVISIONS_PER_TASK ?? 50),
  webRoot: process.env.WEB_ROOT ?? path.resolve(process.cwd(), '../web'),
  /**
   * IANA zone the task API and MCP tools resolve "today", "fri" and "6pm" in.
   * The container's own zone is usually UTC, which is nobody's wall clock.
   */
  timeZone: process.env.YARUKOTO_TZ ?? process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  /**
   * Beside `src/` and the compiled `dist/` alike, so it doesn't depend on the directory the
   * process starts in: the image runs from `/app`, where a cwd-relative default finds nothing.
   */
  migrationsDir: process.env.MIGRATIONS_DIR ?? path.resolve(__dirname, '../migrations'),
  /** Next to the database by default, so the one volume people already mount holds both. */
  backupDir: process.env.BACKUP_DIR ?? path.join(path.dirname(databasePath), 'backups'),
  backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS ?? 24),
  backupKeep: Number(process.env.BACKUP_KEEP ?? 7),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
};

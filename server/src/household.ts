import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { HouseholdDevice, HouseholdMember, HouseholdRole } from '@yarukoto/domain/types';
import { OWNER_ID, Viewer, isAdmin } from './access';
import { hashToken } from './auth';

/**
 * People, devices, and signing in by approval.
 *
 * There are no passwords. A device without a token starts a pairing, shows its
 * short code (and a QR of it), and polls with a secret only it holds. Someone
 * already signed in approves the code — for themselves, as a new person joining
 * the household, or as a household integration — and the next poll hands the
 * device its own token. Phones, browsers and Home Assistant all join this way,
 * so there is one flow to get right rather than three.
 */

export class HouseholdError extends Error {
  constructor(
    readonly code: 'not_found' | 'bad_request' | 'forbidden' | 'gone' | 'rate_limited',
    message: string
  ) {
    super(message);
  }
}

/** How long a code stays usable. Long enough to walk to another room. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Codes waiting at once. Starting a pairing needs no token, so it is capped. */
const MAX_PENDING_PAIRINGS = 20;
/** No 0/O, 1/I/L: a code gets read aloud and typed on a phone. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

interface UserRow {
  id: string;
  name: string;
  role: HouseholdRole;
  created_at: string;
  deleted_at: string | null;
}

interface DeviceRow {
  id: string;
  user_id: string | null;
  name: string;
  kind: 'app' | 'integration';
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

interface PairingRow {
  id: string;
  code: string;
  secret_hash: string;
  name: string;
  status: 'pending' | 'approved';
  user_id: string | null;
  token: string | null;
  created_at: string;
  expires_at: string;
}

function memberFromRow(row: UserRow): HouseholdMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
  };
}

function deviceFromRow(row: DeviceRow): HouseholdDevice {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at,
    ...(row.last_seen_at ? { lastSeenAt: row.last_seen_at } : {}),
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
  };
}

function randomCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** What a person types can be missing its dash, or be lowercase. */
export function normalizeCode(code: string): string {
  const bare = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return bare.length === 8 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

function newToken(): string {
  return `yk_${crypto.randomBytes(32).toString('base64url')}`;
}

function cleanName(name: unknown, fallback: string): string {
  const trimmed = typeof name === 'string' ? name.trim().slice(0, 60) : '';
  return trimmed || fallback;
}

/**
 * Drops pairings past their time, and with them any device an approval made
 * for a pairing nobody claimed. The token for such a device only ever lived on
 * the pairing row, so once that is gone the device can never sign in: left in
 * place it would sit in the list as a phone that was never there. An approved
 * sign-in-by-QR that nobody scanned is exactly this.
 */
function purgeExpired(db: Database.Database, now: number): void {
  const cutoff = new Date(now).toISOString();
  const unclaimed = db
    .prepare("SELECT token FROM pairings WHERE expires_at < ? AND status = 'approved' AND token IS NOT NULL")
    .all(cutoff) as { token: string }[];
  const dropDevice = db.prepare('DELETE FROM devices WHERE token_hash = ? AND last_seen_at IS NULL');
  for (const { token } of unclaimed) dropDevice.run(hashToken(token));
  db.prepare('DELETE FROM pairings WHERE expires_at < ?').run(cutoff);
}

// ---- Pairing ---------------------------------------------------------------

export function startPairing(
  db: Database.Database,
  name: unknown,
  now = Date.now()
): { pairingId: string; code: string; secret: string; expiresAt: string } {
  purgeExpired(db, now);
  const pending = (db.prepare("SELECT COUNT(*) AS n FROM pairings WHERE status = 'pending'").get() as { n: number }).n;
  if (pending >= MAX_PENDING_PAIRINGS) {
    throw new HouseholdError('rate_limited', 'Too many sign-in codes are waiting; try again in a few minutes.');
  }
  const secret = crypto.randomBytes(32).toString('base64url');
  const row = {
    id: `p-${crypto.randomUUID()}`,
    code: randomCode(),
    secretHash: hashToken(secret),
    name: cleanName(name, 'New device'),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PAIRING_TTL_MS).toISOString(),
  };
  db.prepare(
    `INSERT INTO pairings (id, code, secret_hash, name, created_at, expires_at)
     VALUES (@id, @code, @secretHash, @name, @createdAt, @expiresAt)`
  ).run(row);
  return { pairingId: row.id, code: row.code, secret, expiresAt: row.expiresAt };
}

export type ApproveAs =
  /** Another device of the approver's own. */
  | { as: 'self' }
  /** Someone joining the household, on their device. Admin only. */
  | { as: 'member'; name: string }
  /** A household integration such as Home Assistant. Admin only. */
  | { as: 'integration' };

/**
 * Approves a waiting code. The token is minted now but handed over only to the
 * poll that proves it holds the pairing's secret — the code alone, which has
 * been on a screen and maybe read aloud, never yields a credential.
 */
export function approvePairing(
  db: Database.Database,
  viewer: Viewer,
  code: string,
  how: ApproveAs,
  now = Date.now()
): { device: HouseholdDevice; member: HouseholdMember | null } {
  if (viewer.kind !== 'user') throw new HouseholdError('forbidden', 'Only a person can approve a sign-in');
  if (how.as !== 'self' && !isAdmin(viewer)) {
    throw new HouseholdError('forbidden', 'Only an admin can add people or integrations');
  }
  purgeExpired(db, now);
  const pairing = db
    .prepare("SELECT * FROM pairings WHERE code = ? AND status = 'pending'")
    .get(normalizeCode(code)) as PairingRow | undefined;
  if (!pairing) throw new HouseholdError('not_found', 'That code has expired or was never issued');

  return db.transaction(() => {
    const stamp = new Date(now).toISOString();
    let userId: string | null = viewer.userId;
    let member: HouseholdMember | null = null;
    if (how.as === 'member') {
      const row: UserRow = {
        id: `u-${crypto.randomUUID()}`,
        name: cleanName(how.name, ''),
        role: 'member',
        created_at: stamp,
        deleted_at: null,
      };
      if (!row.name) throw new HouseholdError('bad_request', 'A new person needs a name');
      db.prepare('INSERT INTO users (id, name, role, created_at) VALUES (@id, @name, @role, @created_at)').run(row);
      userId = row.id;
      member = memberFromRow(row);
    } else if (how.as === 'integration') {
      userId = null;
    }

    const token = newToken();
    const device: DeviceRow = {
      id: `d-${crypto.randomUUID()}`,
      user_id: userId,
      name: pairing.name,
      kind: how.as === 'integration' ? 'integration' : 'app',
      created_at: stamp,
      last_seen_at: null,
      revoked_at: null,
    };
    db.prepare(
      `INSERT INTO devices (id, user_id, name, kind, token_hash, created_at)
       VALUES (@id, @user_id, @name, @kind, @tokenHash, @created_at)`
    ).run({ ...device, tokenHash: hashToken(token) });
    db.prepare("UPDATE pairings SET status = 'approved', user_id = ?, token = ? WHERE id = ?").run(
      userId,
      token,
      pairing.id
    );
    return { device: deviceFromRow(device), member };
  })();
}

export type PollResult =
  | { status: 'pending' }
  | { status: 'approved'; token: string; member: HouseholdMember | null; integration: boolean };

/** The waiting device asking whether it has been let in. A claim happens once. */
export function pollPairing(db: Database.Database, pairingId: string, secret: string, now = Date.now()): PollResult {
  const pairing = db.prepare('SELECT * FROM pairings WHERE id = ?').get(pairingId) as PairingRow | undefined;
  const valid =
    !!pairing &&
    typeof secret === 'string' &&
    crypto.timingSafeEqual(Buffer.from(hashToken(secret)), Buffer.from(pairing.secret_hash));
  if (!pairing || !valid) throw new HouseholdError('not_found', 'No such sign-in');
  if (pairing.status === 'pending') {
    if (Date.parse(pairing.expires_at) < now) {
      db.prepare('DELETE FROM pairings WHERE id = ?').run(pairing.id);
      throw new HouseholdError('gone', 'This code expired; start again');
    }
    return { status: 'pending' };
  }
  db.prepare('DELETE FROM pairings WHERE id = ?').run(pairing.id);
  const user = pairing.user_id
    ? (db.prepare('SELECT * FROM users WHERE id = ?').get(pairing.user_id) as UserRow | undefined)
    : undefined;
  return {
    status: 'approved',
    token: pairing.token!,
    member: user ? memberFromRow(user) : null,
    integration: !pairing.user_id,
  };
}

// ---- People and devices ----------------------------------------------------

export function whoAmI(
  db: Database.Database,
  viewer: Viewer
): { member: HouseholdMember | null; device: HouseholdDevice | null; household: HouseholdMember[] } {
  const member =
    viewer.kind === 'user'
      ? memberFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(viewer.userId) as UserRow)
      : null;
  const device = viewer.deviceId
    ? deviceFromRow(db.prepare('SELECT * FROM devices WHERE id = ?').get(viewer.deviceId) as DeviceRow)
    : null;
  return { member, device, household: liveMembers(db) };
}

function liveMembers(db: Database.Database): HouseholdMember[] {
  return (db.prepare('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at').all() as UserRow[]).map(
    memberFromRow
  );
}

/**
 * The household as the viewer may see it. Everyone sees who is in it — that is
 * who a task can be assigned to — and their own devices. An admin also sees
 * removed people, so they can be restored, and every device.
 */
export function describeHousehold(
  db: Database.Database,
  viewer: Viewer
): { members: HouseholdMember[]; devices: HouseholdDevice[] } {
  if (viewer.kind !== 'user') throw new HouseholdError('forbidden', 'Integrations cannot manage the household');
  purgeExpired(db, Date.now());
  if (isAdmin(viewer)) {
    return {
      members: (db.prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[]).map(memberFromRow),
      devices: (db.prepare('SELECT * FROM devices WHERE revoked_at IS NULL ORDER BY created_at').all() as DeviceRow[]).map(
        deviceFromRow
      ),
    };
  }
  return {
    members: liveMembers(db),
    devices: (
      db
        .prepare('SELECT * FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at')
        .all(viewer.userId) as DeviceRow[]
    ).map(deviceFromRow),
  };
}

export function renameMember(db: Database.Database, viewer: Viewer, id: string, name: unknown): HouseholdMember {
  if (viewer.kind !== 'user' || (viewer.userId !== id && !isAdmin(viewer))) {
    throw new HouseholdError('forbidden', 'You can only rename yourself');
  }
  const clean = cleanName(name, '');
  if (!clean) throw new HouseholdError('bad_request', 'A name cannot be empty');
  const result = db.prepare('UPDATE users SET name = ? WHERE id = ?').run(clean, id);
  if (result.changes === 0) throw new HouseholdError('not_found', `No household member with id ${id}`);
  return memberFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow);
}

/**
 * Every row whose visibility depends on this person, re-sent on everyone's next
 * pull: their lists, the tasks in them, and their Inbox. Removing or restoring
 * someone changes who can see all of it, and `removed` on a pull only reports
 * rows that changed since the cursor.
 */
function touchPersonsRows(db: Database.Database, userId: string, stamp: string): void {
  db.prepare('UPDATE lists SET server_updated_at = ? WHERE owner_id = ?').run(stamp, userId);
  db.prepare(
    `UPDATE tasks SET server_updated_at = ?
     WHERE (list_id IS NULL AND owner_id = ?) OR list_id IN (SELECT id FROM lists WHERE owner_id = ?)`
  ).run(stamp, userId, userId);
}

/**
 * Soft: the person and every row they own stay exactly as they are, hidden,
 * and their devices stop working. Restoring them brings it all back. What
 * they added to shared lists stays on those lists throughout.
 */
export function removeMember(db: Database.Database, viewer: Viewer, id: string, now = Date.now()): HouseholdMember {
  if (!isAdmin(viewer)) throw new HouseholdError('forbidden', 'Only an admin can remove people');
  if (id === OWNER_ID || (viewer.kind === 'user' && viewer.userId === id)) {
    throw new HouseholdError('bad_request', 'The owner, and you, cannot be removed');
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) throw new HouseholdError('not_found', `No household member with id ${id}`);
  if (row.deleted_at) return memberFromRow(row);
  const stamp = new Date(now).toISOString();
  db.transaction(() => {
    db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(stamp, id);
    db.prepare('UPDATE devices SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(stamp, id);
    touchPersonsRows(db, id, stamp);
  })();
  return memberFromRow({ ...row, deleted_at: stamp });
}

/** Brings a removed person back with everything they had. Their old devices stay signed out. */
export function restoreMember(db: Database.Database, viewer: Viewer, id: string, now = Date.now()): HouseholdMember {
  if (!isAdmin(viewer)) throw new HouseholdError('forbidden', 'Only an admin can restore people');
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) throw new HouseholdError('not_found', `No household member with id ${id}`);
  if (!row.deleted_at) return memberFromRow(row);
  db.transaction(() => {
    db.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').run(id);
    touchPersonsRows(db, id, new Date(now).toISOString());
  })();
  return memberFromRow({ ...row, deleted_at: null });
}

/** Signs a device out. Your own, or — for an admin — anyone's. */
export function revokeDevice(db: Database.Database, viewer: Viewer, id: string, now = Date.now()): HouseholdDevice {
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow | undefined;
  if (!row) throw new HouseholdError('not_found', `No device with id ${id}`);
  const own = viewer.kind === 'user' && row.user_id === viewer.userId;
  if (!own && !isAdmin(viewer)) throw new HouseholdError('forbidden', 'You can only sign out your own devices');
  if (!row.revoked_at) {
    row.revoked_at = new Date(now).toISOString();
    db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ?').run(row.revoked_at, id);
  }
  return deviceFromRow(row);
}

/**
 * A person deleting their own account: the one hard delete in the household,
 * because it is theirs to ask for and an app store requires it to mean what it
 * says. Removing someone (above) stays soft — that is an admin acting on
 * another person's data.
 *
 * Erased: the person, their devices, their private lists and every task in
 * them, their Inbox, and their own folders, saved filters and view settings,
 * along with those tasks' history. Kept: what belongs to the household. A
 * shared list they made passes to the owner (out of the folder that no longer
 * exists), and tasks they added or were assigned on shared lists stay, no
 * longer pointing at them. Those rows are touched so the next pull carries the
 * change; nobody else could see the erased rows, so nothing else needs telling.
 *
 * The owner signs in with the server's own token and cannot be deleted from
 * the app: whoever runs the server deletes it there.
 */
export function deleteOwnAccount(db: Database.Database, viewer: Viewer, now = Date.now()): void {
  if (viewer.kind !== 'user') throw new HouseholdError('forbidden', 'Only a person has an account to delete');
  if (viewer.userId === OWNER_ID) {
    throw new HouseholdError('bad_request', "The household owner's account belongs to the server and cannot be deleted");
  }
  const id = viewer.userId;
  const stamp = new Date(now).toISOString();
  db.transaction(() => {
    const privateLists = `SELECT id FROM lists WHERE owner_id = @id AND shared = 0`;
    const erasedTasks = `SELECT id FROM tasks WHERE (list_id IS NULL AND owner_id = @id) OR list_id IN (${privateLists})`;
    db.prepare(`DELETE FROM task_revisions WHERE task_id IN (${erasedTasks})`).run({ id });
    db.prepare(`DELETE FROM tasks WHERE id IN (${erasedTasks})`).run({ id });
    db.prepare('DELETE FROM lists WHERE owner_id = @id AND shared = 0').run({ id });

    db.prepare('UPDATE lists SET owner_id = @owner, folder_id = NULL, server_updated_at = @stamp WHERE owner_id = @id').run({
      id,
      owner: OWNER_ID,
      stamp,
    });
    db.prepare('UPDATE tasks SET owner_id = @owner, server_updated_at = @stamp WHERE owner_id = @id').run({
      id,
      owner: OWNER_ID,
      stamp,
    });
    db.prepare('UPDATE tasks SET assignee_id = NULL, server_updated_at = @stamp WHERE assignee_id = @id').run({ id, stamp });

    for (const table of ['folders', 'saved_filters', 'view_prefs']) {
      db.prepare(`DELETE FROM ${table} WHERE owner_id = ?`).run(id);
    }
    db.prepare('DELETE FROM pairings WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM devices WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  })();
}

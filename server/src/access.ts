import { HouseholdRole } from '../../shared/types';

/**
 * Who a request is acting as, and the one place that decides what they see.
 *
 * Every read that can return a task or list — sync pulls, the task API, MCP,
 * history — filters with the SQL below, and every write checks against it, so
 * "who can see this" has one answer. A second, hand-written copy of the rule in
 * some route is how a private list ends up on someone else's phone.
 */
export type Viewer =
  /** A person, signed in on one of their devices or with the env token. */
  | { kind: 'user'; userId: string; role: HouseholdRole; deviceId: string | null }
  /** A household integration (Home Assistant): shared lists only, no Inbox. */
  | { kind: 'household'; deviceId: string };

/** The id the env token signs in as, created by 008_household.sql. */
export const OWNER_ID = 'u-owner';

/** The env token's viewer: the household owner, as every client was before households. */
export const OWNER_VIEWER: Viewer = { kind: 'user', userId: OWNER_ID, role: 'admin', deviceId: null };

export function viewerUserId(viewer: Viewer): string | null {
  return viewer.kind === 'user' ? viewer.userId : null;
}

export function isAdmin(viewer: Viewer): boolean {
  return viewer.kind === 'user' && viewer.role === 'admin';
}

/**
 * A list `alias` can be seen: shared, or the viewer's own. A private list whose
 * owner has been removed is seen by nobody until they are restored.
 *
 * Binds `@viewerId`; pass `viewerParams(viewer)` alongside.
 */
export function listVisibleSql(viewer: Viewer, alias = 'lists'): string {
  return viewer.kind === 'household' ? `${alias}.shared = 1` : `(${alias}.shared = 1 OR ${alias}.owner_id = @viewerId)`;
}

/** A task `alias` can be seen: its list can, or it is the viewer's own Inbox task. */
export function taskVisibleSql(viewer: Viewer, alias = 'tasks'): string {
  const inList = `${alias}.list_id IN (SELECT vl.id FROM lists vl WHERE ${listVisibleSql(viewer, 'vl')})`;
  if (viewer.kind === 'household') return inList;
  return `(${inList} OR (${alias}.list_id IS NULL AND ${alias}.owner_id = @viewerId))`;
}

export function viewerParams(viewer: Viewer): { viewerId: string } {
  // A household viewer binds a value no row can own, so a stray `@viewerId`
  // in a query it runs can never match anything.
  return { viewerId: viewerUserId(viewer) ?? '\u0000household' };
}

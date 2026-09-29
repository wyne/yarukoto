import {
  FolderDef,
  HouseholdDevice,
  HouseholdMember,
  ListDef,
  SERVER_FEATURES,
  SavedFilter,
  ServerFeature,
  Task,
  ViewPref,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface SyncBatch {
  now: string;
  tasks: Task[];
  lists: ListDef[];
  folders: FolderDef[];
  viewPrefs: ViewPref[];
  savedFilters: SavedFilter[];
  /**
   * Rows that changed but this person can no longer see — a list unshared, a
   * task moved into someone else's private list. Drop the local copy.
   */
  removed: { tasks: string[]; lists: string[] };
}

export interface SyncPush {
  tasks?: Task[];
  lists?: ListDef[];
  folders?: FolderDef[];
  viewPrefs?: ViewPref[];
  savedFilters?: SavedFilter[];
}

export interface ActivityRevision {
  id: number;
  taskId: string;
  task: Task;
  previousTask: Task | null;
  op: 'create' | 'update' | 'delete' | 'restore' | string;
  recordedAt: string;
}

/** What `/api/v1/health` reports about the build it's running. */
export interface ServerInfo {
  version: string;
  commit: string | null;
  commitShort: string | null;
  builtAt: string | null;
  /** Optional backend capabilities. Missing means no optional features. */
  features: ServerFeature[];
}

/** Who this token signs in as. `member` is null for a household integration. */
export interface WhoAmI {
  member: HouseholdMember | null;
  /** Null when signed in with the server's own access token rather than a paired device. */
  device: HouseholdDevice | null;
  /** Everyone currently in the household — who a task can be assigned to. */
  household: HouseholdMember[];
}

/** People and devices as the signed-in person may see them. */
export interface HouseholdView {
  members: HouseholdMember[];
  devices: HouseholdDevice[];
}

/** How an approval lets a waiting device in. */
export type ApproveAs = { as: 'self' } | { as: 'member'; name: string } | { as: 'integration' };

export interface Api {
  /** Server build info, or null when the server can't be reached. */
  health: () => Promise<ServerInfo | null>;
  pull: (since?: string) => Promise<SyncBatch>;
  push: (batch: SyncPush) => Promise<SyncBatch>;
  activity: (limit?: number, beforeId?: number) => Promise<ActivityRevision[]>;
  me: () => Promise<WhoAmI>;
  household: () => Promise<HouseholdView>;
  approvePairing: (code: string, how: ApproveAs) => Promise<{ device: HouseholdDevice; member: HouseholdMember | null }>;
  renameMember: (id: string, name: string) => Promise<HouseholdMember>;
  removeMember: (id: string) => Promise<HouseholdMember>;
  restoreMember: (id: string) => Promise<HouseholdMember>;
  revokeDevice: (id: string) => Promise<HouseholdDevice>;
}

/**
 * The server's own words for a refusal, when it gave some. Household routes
 * answer `{ error, message }`, and "That code has expired" is more use on
 * screen than a status number.
 */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.message === 'string' && body.message) return body.message;
  } catch {
    // Not JSON; fall through to the status.
  }
  return `Server responded with ${res.status}.`;
}

/** A fetch wrapper carrying the server's base URL and bearer token. */
export function createApi(serverUrl: string, token: string): Api {
  const base = serverUrl.replace(/\/+$/, '');

  async function request(path: string, init?: RequestInit): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    } catch {
      throw new ApiError(0, 'Could not reach the server.');
    }
    if (res.status === 401) throw new ApiError(401, 'That token was rejected by the server.');
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
    return res.json();
  }

  // A server older than view-option or saved-filter syncing answers without that
  // key at all; filling it in here keeps every caller downstream working with a
  // real array.
  async function syncRequest(path: string, init?: RequestInit): Promise<SyncBatch> {
    const batch = await request(path, init);
    return {
      ...batch,
      viewPrefs: batch.viewPrefs ?? [],
      savedFilters: batch.savedFilters ?? [],
      removed: {
        tasks: Array.isArray(batch.removed?.tasks) ? batch.removed.tasks : [],
        lists: Array.isArray(batch.removed?.lists) ? batch.removed.lists : [],
      },
    };
  }

  return {
    health: async () => {
      try {
        const res = await fetch(`${base}/api/v1/health`);
        if (!res.ok) return null;
        const body = await res.json();
        if (!body || body.ok !== true) return null;
        // A server older than this field reports nothing; the sheet says so rather
        // than pretending a version it doesn't know.
        return {
          version: typeof body.version === 'string' ? body.version : '',
          commit: typeof body.commit === 'string' ? body.commit : null,
          commitShort: typeof body.commitShort === 'string' ? body.commitShort : null,
          builtAt: typeof body.builtAt === 'string' ? body.builtAt : null,
          features: Array.isArray(body.features)
            ? body.features.filter((feature: unknown): feature is ServerFeature =>
                SERVER_FEATURES.includes(feature as ServerFeature)
              )
            : [],
        };
      } catch {
        return null;
      }
    },
    pull: (since) => syncRequest(`/api/v1/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`),
    push: (batch) => syncRequest('/api/v1/sync', { method: 'POST', body: JSON.stringify(batch) }),
    activity: async (limit = 80, beforeId) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (beforeId !== undefined) params.set('beforeId', String(beforeId));
      const body = await request(`/api/v1/activity?${params.toString()}`);
      return Array.isArray(body?.revisions) ? body.revisions : [];
    },
    me: () => request('/api/v1/me'),
    household: () => request('/api/v1/household'),
    approvePairing: (code, how) =>
      request('/api/v1/pair/approve', { method: 'POST', body: JSON.stringify({ code, ...how }) }),
    renameMember: async (id, name) =>
      (await request(`/api/v1/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) }))
        .member,
    removeMember: async (id) =>
      (await request(`/api/v1/users/${encodeURIComponent(id)}`, { method: 'DELETE' })).member,
    restoreMember: async (id) =>
      (await request(`/api/v1/users/${encodeURIComponent(id)}/restore`, { method: 'POST' })).member,
    revokeDevice: async (id) =>
      (await request(`/api/v1/devices/${encodeURIComponent(id)}`, { method: 'DELETE' })).device,
  };
}

export interface Pairing {
  pairingId: string;
  /** What the person types or scans on the approving device, e.g. `K7QM-3XPA`. */
  code: string;
  /** Proves this device started the pairing. Never shown. */
  secret: string;
  expiresAt: string;
}

export type PairingPoll =
  | { status: 'pending' }
  | { status: 'approved'; token: string; member: HouseholdMember | null; integration: boolean };

/**
 * Signing in without a token: the two calls a device makes before it has one.
 * Kept apart from `createApi`, whose every request carries a bearer token.
 */
export function createPairingApi(serverUrl: string) {
  const base = serverUrl.replace(/\/+$/, '');

  async function post(path: string, body: unknown): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Could not reach the server.');
    }
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
    return res.json();
  }

  return {
    start: (name: string): Promise<Pairing> => post('/api/v1/pair/start', { name }),
    poll: (pairing: Pick<Pairing, 'pairingId' | 'secret'>): Promise<PairingPoll> =>
      post('/api/v1/pair/poll', { pairingId: pairing.pairingId, secret: pairing.secret }),
  };
}

/**
 * What a sign-in QR code carries: a link that opens Yarukoto on the phone that
 * scans it, straight to approving this code.
 */
export function pairingLink(code: string): string {
  return `yarukoto://pair?code=${encodeURIComponent(code)}`;
}

/**
 * A sign-in handed *to* a new phone: the signed-in device started a pairing
 * and approved it itself, and shows this so the phone can claim the token by
 * scanning, with nothing to type — not even the server address.
 *
 * It carries a live credential for the pairing's few minutes, single use, the
 * same trade a messaging app's "link a device" QR makes.
 */
export interface JoinLink {
  serverUrl: string;
  pairing: Pick<Pairing, 'pairingId' | 'secret'>;
}

export function joinLink(serverUrl: string, pairing: Pick<Pairing, 'pairingId' | 'secret'>): string {
  const e = encodeURIComponent;
  return `yarukoto://join?server=${e(serverUrl)}&pairing=${e(pairing.pairingId)}&secret=${e(pairing.secret)}`;
}

/**
 * Query parameters by hand: React Native's `URLSearchParams` has, in some
 * versions, a constructor and no `get`.
 */
function queryParams(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    try {
      out[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
    } catch {
      // A malformed escape makes this one parameter unreadable, not the link.
    }
  }
  return out;
}

/** A scanned join link's contents, or null for any other URL. */
export function parseJoinLink(url: string): JoinLink | null {
  const match = /^yarukoto:\/\/join\?(.*)$/i.exec(url);
  if (!match) return null;
  const params = queryParams(match[1].split('#')[0]);
  const serverUrl = params.server;
  const pairingId = params.pairing;
  const secret = params.secret;
  if (!serverUrl || !/^https?:\/\//i.test(serverUrl) || !pairingId || !secret) return null;
  return { serverUrl, pairing: { pairingId, secret } };
}

/** The code out of a scanned sign-in link, or null for any other URL. */
export function codeFromPairingLink(url: string): string | null {
  const match = /^yarukoto:\/\/pair\?(?:.*&)?code=([^&#]+)/i.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

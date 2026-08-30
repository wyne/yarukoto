import { FolderDef, ListDef, SERVER_FEATURES, ServerFeature, Task, ViewPref } from './types';

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
}

export interface SyncPush {
  tasks?: Task[];
  lists?: ListDef[];
  folders?: FolderDef[];
  viewPrefs?: ViewPref[];
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

export interface Api {
  /** Server build info, or null when the server can't be reached. */
  health: () => Promise<ServerInfo | null>;
  pull: (since?: string) => Promise<SyncBatch>;
  push: (batch: SyncPush) => Promise<SyncBatch>;
  activity: (limit?: number, beforeId?: number) => Promise<ActivityRevision[]>;
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
    if (!res.ok) throw new ApiError(res.status, `Server responded with ${res.status}.`);
    return res.json();
  }

  // A server older than view-option syncing answers without a `viewPrefs` key at
  // all; filling it in here keeps every caller downstream working with a real array.
  async function syncRequest(path: string, init?: RequestInit): Promise<SyncBatch> {
    const batch = await request(path, init);
    return { ...batch, viewPrefs: batch.viewPrefs ?? [] };
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
  };
}

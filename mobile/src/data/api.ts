import { FolderDef, ListDef, Task, ViewPref } from './types';

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

export interface Api {
  health: () => Promise<boolean>;
  pull: (since?: string) => Promise<SyncBatch>;
  push: (batch: SyncPush) => Promise<SyncBatch>;
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
        return res.ok;
      } catch {
        return false;
      }
    },
    pull: (since) => syncRequest(`/api/v1/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`),
    push: (batch) => syncRequest('/api/v1/sync', { method: 'POST', body: JSON.stringify(batch) }),
  };
}

import { FolderDef, ListDef, Task } from './types';

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
}

export interface SyncPush {
  tasks?: Task[];
  lists?: ListDef[];
  folders?: FolderDef[];
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

  return {
    health: async () => {
      try {
        const res = await fetch(`${base}/api/v1/health`);
        return res.ok;
      } catch {
        return false;
      }
    },
    pull: (since) => request(`/api/v1/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`),
    push: (batch) => request('/api/v1/sync', { method: 'POST', body: JSON.stringify(batch) }),
  };
}

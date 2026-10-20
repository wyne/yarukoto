import {
  ApiError,
  createApi,
  createPairingApi,
} from '../src/data/api';
import { pullSince } from '../src/data/sync';

const originalFetch = global.fetch;

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

function fetchOnce(body: unknown, status = 200) {
  const mock = jest.fn(async () => response(body, status));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('server health and compatibility', () => {
  test('normalizes build information and keeps only known feature ids', async () => {
    const fetcher = fetchOnce({
      ok: true,
      version: '1.2.3',
      commit: 42,
      commitShort: 'abc123',
      builtAt: null,
      features: ['taskReminders', 'futureFeature'],
    });

    await expect(createApi('https://tasks.test///', 'token').health()).resolves.toEqual({
      version: '1.2.3',
      commit: null,
      commitShort: 'abc123',
      builtAt: null,
      features: ['taskReminders'],
    });
    expect(fetcher).toHaveBeenCalledWith('https://tasks.test/api/v1/health');
  });

  test.each([
    ['an HTTP failure', response({}, 503)],
    ['a response without the health marker', response({ version: '1.2.3' })],
  ])('returns null for %s', async (_label, result) => {
    global.fetch = jest.fn(async () => result) as unknown as typeof fetch;
    await expect(createApi('https://tasks.test', 'token').health()).resolves.toBeNull();
  });

  test('returns null when the health probe cannot reach the server', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    await expect(createApi('https://tasks.test', 'token').health()).resolves.toBeNull();
  });
});

describe('authenticated API requests', () => {
  test('normalizes sync responses from servers predating optional collections', async () => {
    const fetcher = fetchOnce({ now: 'cursor', tasks: [], lists: [], folders: [] });

    await expect(createApi('https://tasks.test', 'secret').pull('a cursor')).resolves.toEqual({
      now: 'cursor',
      tasks: [],
      lists: [],
      folders: [],
      viewPrefs: [],
      savedFilters: [],
      removed: { tasks: [], lists: [] },
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://tasks.test/api/v1/sync?since=a%20cursor',
      expect.objectContaining({ headers: { Authorization: 'Bearer secret' } })
    );
  });

  test('posts sync rows as JSON and sanitizes malformed removed ids', async () => {
    const fetcher = fetchOnce({
      now: 'cursor', tasks: [], lists: [], folders: [], viewPrefs: [], savedFilters: [],
      removed: { tasks: 'not-an-array', lists: ['list-1'] },
    });
    const batch = { tasks: [] };

    const result = await createApi('https://tasks.test', 'secret').push(batch);

    expect(result.removed).toEqual({ tasks: [], lists: ['list-1'] });
    expect(fetcher).toHaveBeenCalledWith('https://tasks.test/api/v1/sync', {
      method: 'POST',
      body: JSON.stringify(batch),
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
    });
  });

  test('turns network failures into an offline ApiError', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    await expect(createApi('https://tasks.test', 'secret').me()).rejects.toMatchObject({
      name: 'Error',
      status: 0,
      message: 'Could not reach the server.',
    });
  });

  test('uses the server message for failures and falls back safely for non-JSON errors', async () => {
    fetchOnce({ message: 'Pairing expired.' }, 410);
    await expect(createApi('https://tasks.test', 'secret').me()).rejects.toMatchObject({
      status: 410,
      message: 'Pairing expired.',
    });

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('html'); },
    })) as unknown as typeof fetch;
    await expect(createApi('https://tasks.test', 'secret').me()).rejects.toMatchObject({
      status: 502,
      message: 'Server responded with 502.',
    });
  });

  test('encodes activity and history queries and tolerates missing revision arrays', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response({ revisions: [{ id: 1 }] }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ revisions: 'invalid' }));
    global.fetch = fetcher as unknown as typeof fetch;
    const api = createApi('https://tasks.test', 'secret');

    await expect(api.activity(25, 90)).resolves.toEqual([{ id: 1 }]);
    await expect(api.taskHistory('task/a')).resolves.toEqual([]);
    await expect(api.activity()).resolves.toEqual([]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://tasks.test/api/v1/activity?limit=25&beforeId=90',
      'https://tasks.test/api/v1/tasks/task%2Fa/history',
      'https://tasks.test/api/v1/activity?limit=80',
    ]);
  });

  test('maps household mutation envelopes to their records', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response({ member: { id: 'u-1', name: 'New' } }))
      .mockResolvedValueOnce(response({ member: { id: 'u-1', removedAt: 'now' } }))
      .mockResolvedValueOnce(response({ member: { id: 'u-1', removedAt: null } }))
      .mockResolvedValueOnce(response({ device: { id: 'd/a', revokedAt: 'now' } }))
      .mockResolvedValue(response({ ok: true }));
    global.fetch = fetcher as unknown as typeof fetch;
    const api = createApi('https://tasks.test', 'secret');

    await expect(api.renameMember('u/1', 'New')).resolves.toMatchObject({ name: 'New' });
    await expect(api.removeMember('u/1')).resolves.toMatchObject({ removedAt: 'now' });
    await expect(api.restoreMember('u/1')).resolves.toMatchObject({ removedAt: null });
    await expect(api.revokeDevice('d/a')).resolves.toMatchObject({ revokedAt: 'now' });
    await expect(api.deleteAccount()).resolves.toBeUndefined();
    await expect(api.eraseHousehold()).resolves.toBeUndefined();

    expect(fetcher.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['https://tasks.test/api/v1/users/u%2F1', 'PATCH'],
      ['https://tasks.test/api/v1/users/u%2F1', 'DELETE'],
      ['https://tasks.test/api/v1/users/u%2F1/restore', 'POST'],
      ['https://tasks.test/api/v1/devices/d%2Fa', 'DELETE'],
      ['https://tasks.test/api/v1/me', 'DELETE'],
      ['https://tasks.test/api/v1/household', 'DELETE'],
    ]);
  });
});

describe('pairing and cursor recovery', () => {
  test('starts and polls pairing without sending a bearer token', async () => {
    const pairing = { pairingId: 'p-1', secret: 's-1', code: 'ABCD-1234', expiresAt: 'later' };
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response(pairing))
      .mockResolvedValueOnce(response({ status: 'pending' }));
    global.fetch = fetcher as unknown as typeof fetch;
    const api = createPairingApi('https://tasks.test/');

    await expect(api.start('Phone')).resolves.toEqual(pairing);
    await expect(api.poll(pairing)).resolves.toEqual({ status: 'pending' });
    expect(fetcher.mock.calls).toEqual([
      ['https://tasks.test/api/v1/pair/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Phone' }),
      }],
      ['https://tasks.test/api/v1/pair/poll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairingId: 'p-1', secret: 's-1' }),
      }],
    ]);
  });

  test('retries a full pull when the incremental cursor has expired', async () => {
    const fresh = { now: 'fresh' } as never;
    const api = {
      pull: jest.fn()
        .mockRejectedValueOnce(new ApiError(409, 'Cursor expired'))
        .mockResolvedValueOnce(fresh),
    } as never;

    await expect(pullSince(api, 'old')).resolves.toBe(fresh);
    expect((api as { pull: jest.Mock }).pull.mock.calls).toEqual([['old'], [undefined]]);
  });

  test('does not retry other pull failures', async () => {
    const error = new ApiError(503, 'Offline');
    const api = { pull: jest.fn().mockRejectedValue(error) } as never;
    await expect(pullSince(api, 'cursor')).rejects.toBe(error);
    expect((api as { pull: jest.Mock }).pull).toHaveBeenCalledTimes(1);
  });
});

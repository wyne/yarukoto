/**
 * Credentials move from AsyncStorage into SecureStore, and never get lost on the
 * way: the old copy goes only once the new one is written.
 */
const mockAsyncData: Record<string, string> = {};
const mockSecureData: Record<string, string> = {};
const mockState = { secureFails: false };

jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: async (keys: string[]) => keys.map((k) => [k, mockAsyncData[k] ?? null]),
  getItem: async (k: string) => mockAsyncData[k] ?? null,
  setItem: async (k: string, v: string) => {
    mockAsyncData[k] = v;
  },
  removeItem: async (k: string) => {
    delete mockAsyncData[k];
  },
}));

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (k: string) => {
    if (mockState.secureFails) throw new Error('keychain unavailable');
    return mockSecureData[k] ?? null;
  },
  setItemAsync: async (k: string, v: string) => {
    if (mockState.secureFails) throw new Error('keychain unavailable');
    mockSecureData[k] = v;
  },
  deleteItemAsync: async (k: string) => {
    delete mockSecureData[k];
  },
}));

function reset() {
  for (const k of Object.keys(mockAsyncData)) delete mockAsyncData[k];
  for (const k of Object.keys(mockSecureData)) delete mockSecureData[k];
  mockState.secureFails = false;
  jest.resetModules();
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('moves the token and saved servers out of AsyncStorage on first launch', async () => {
  reset();
  mockAsyncData['yarukoto.token'] = 'secret';
  mockAsyncData['yarukoto.savedServers'] = JSON.stringify([{ url: 'https://a', token: 't' }]);
  mockAsyncData['yarukoto.serverUrl'] = 'https://a';
  const storage = require('../src/data/storage');
  await storage.initStorage();

  expect(storage.loadToken()).toBe('secret');
  expect(storage.loadSavedServers()).toEqual([{ url: 'https://a', token: 't' }]);
  expect(mockSecureData['yarukoto.token']).toBe('secret');
  expect(mockAsyncData['yarukoto.token']).toBeUndefined();
  expect(mockAsyncData['yarukoto.savedServers']).toBeUndefined();
  // Everything else stays where it was.
  expect(mockAsyncData['yarukoto.serverUrl']).toBe('https://a');
});

test('new tokens are written to SecureStore only', async () => {
  reset();
  const storage = require('../src/data/storage');
  await storage.initStorage();
  storage.saveToken('fresh');
  await flush();
  expect(mockSecureData['yarukoto.token']).toBe('fresh');
  expect(mockAsyncData['yarukoto.token']).toBeUndefined();
  await expect(storage.readStoredToken()).resolves.toBe('fresh');

  storage.clearToken();
  await flush();
  expect(mockSecureData['yarukoto.token']).toBeUndefined();
});

test('a SecureStore failure keeps the old copy rather than signing out', async () => {
  reset();
  mockAsyncData['yarukoto.token'] = 'secret';
  mockState.secureFails = true;
  const storage = require('../src/data/storage');
  await storage.initStorage();
  expect(storage.loadToken()).toBe('secret');
  expect(mockAsyncData['yarukoto.token']).toBe('secret');
});

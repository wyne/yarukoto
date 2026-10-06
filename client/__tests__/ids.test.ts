jest.mock('expo-crypto', () => ({
  randomUUID: () => {
    // What a browser does on a plain-http page: crypto.randomUUID is undefined.
    throw new TypeError('randomUUID is not a function');
  },
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff),
}));

import { newTaskId } from '../src/data/ids';

test('ids are still UUIDv4 where the platform has no randomUUID', () => {
  expect(newTaskId()).toMatch(/^t-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

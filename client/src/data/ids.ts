import { getRandomBytes, randomUUID } from 'expo-crypto';

/**
 * Record ids.
 *
 * These were `` `t-${Date.now()}` `` until sync was on the table. Two records
 * created in the same millisecond collided, and — far worse once there's a server
 * — two devices creating records independently would collide constantly, because
 * a millisecond timestamp carries nothing device-specific. UUIDv4 is the fix.
 *
 * The short prefix is kept purely so a bare id is legible when reading the
 * database or a sync payload.
 */
/**
 * A UUIDv4, even where the platform won't hand one over.
 *
 * On the web `randomUUID` is only defined in a secure context, so a browser
 * reaching a server by LAN address over plain http has none, and creating
 * anything threw. `getRandomValues`, which `getRandomBytes` uses there, is
 * available in every context, so the same UUID is assembled from 16 of them.
 */
function uuid(): string {
  try {
    return randomUUID();
  } catch {
    const b = getRandomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(b, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

export const newTaskId = (): string => `t-${uuid()}`;
export const newListId = (): string => `l-${uuid()}`;
export const newFolderId = (): string => `f-${uuid()}`;
export const newSubtaskId = (): string => `st-${uuid()}`;
export const newSavedFilterId = (): string => `sf-${uuid()}`;
export const newReminderId = (): string => `r-${uuid()}`;

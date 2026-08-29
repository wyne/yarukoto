import { randomUUID } from 'expo-crypto';

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
export const newTaskId = (): string => `t-${randomUUID()}`;
export const newListId = (): string => `l-${randomUUID()}`;
export const newFolderId = (): string => `f-${randomUUID()}`;
export const newSubtaskId = (): string => `st-${randomUUID()}`;
export const newReminderId = (): string => `r-${randomUUID()}`;

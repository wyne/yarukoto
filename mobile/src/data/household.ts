import { HouseholdMember, ListDef } from './types';
import { WhoAmI } from './api';

/**
 * Who is signed in, and who else is in the household. Null outside server mode,
 * against a server without households, and before the first answer arrives.
 */
export interface Household {
  /** Null for a household integration, which is not a person. */
  me: HouseholdMember | null;
  /** The paired device this is, or null when signed in with the server's own token. */
  deviceId: string | null;
  /** Everyone currently in the household, in the order they joined. */
  members: HouseholdMember[];
}

export function householdFrom(who: WhoAmI): Household {
  return { me: who.member, deviceId: who.device?.id ?? null, members: who.household };
}

/**
 * Whether the signed-in person owns a list — what sharing, moving and deleting
 * it take. A list from before households, or with nobody to compare against,
 * is taken as one's own, which is what it was.
 */
export function ownsList(list: ListDef, household: Household | null): boolean {
  return !list.ownerId || !household?.me || list.ownerId === household.me.id;
}

/** Someone's name by id, such as a list's owner; null for nobody we know. */
export function memberName(household: Household | null, id: string | null | undefined): string | null {
  if (!household || !id) return null;
  return household.members.find((m) => m.id === id)?.name ?? null;
}

/** Stored households come back from disk, so they are checked, not trusted. */
export function parseHousehold(value: unknown): Household | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const h = value as Partial<Household>;
  if (!Array.isArray(h.members)) return undefined;
  const members = h.members.filter(
    (m): m is HouseholdMember => !!m && typeof m.id === 'string' && typeof m.name === 'string'
  );
  const me = h.me && typeof h.me.id === 'string' ? h.me : null;
  return { me, deviceId: typeof h.deviceId === 'string' ? h.deviceId : null, members };
}

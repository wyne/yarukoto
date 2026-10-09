import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTasks } from '../../data/TaskContext';
import { ApiError, HouseholdView, createApi } from '../../data/api';
import { confirmDestructive } from '../../data/confirm';
import { HouseholdDevice, HouseholdMember } from '../../data/types';

/** The id migration 008 gives the household's first admin, who cannot be removed. */
export const OWNER_ID = 'u-owner';

/**
 * The household as an admin page needs it: everyone, every device this person
 * may see, and the actions on them. Loaded once per open of Settings and shared
 * by the pages, so moving between People and Devices doesn't refetch.
 *
 * Removing someone is soft: their devices are signed out and their private lists
 * and tasks hidden, and Restore brings it all back.
 */
export function useHouseholdAdmin(active: boolean) {
  const { state, household, refreshHousehold } = useTasks();
  const [view, setView] = useState<HouseholdView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = active && state.mode === 'server' && !!household?.me;

  const api = useMemo(() => createApi(state.serverUrl, state.token), [state.serverUrl, state.token]);

  const load = useCallback(async () => {
    try {
      setView(await api.household());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the household.');
    }
  }, [api]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  /** Re-reads both this view and the app's own copy, after anything that changes either. */
  const reload = useCallback(() => Promise.all([load(), refreshHousehold()]), [load, refreshHousehold]);

  const act = useCallback(
    (run: () => Promise<unknown>) => async () => {
      let failure: string | null = null;
      try {
        await run();
      } catch (err) {
        failure = err instanceof ApiError ? err.message : 'That did not work.';
      }
      await reload();
      // After the reload, which clears the error line when it succeeds: a failed
      // sign-out must not vanish the moment the list redraws.
      if (failure) setError(failure);
    },
    [reload]
  );

  const removeMember = (member: HouseholdMember) =>
    confirmDestructive(
      `Remove ${member.name}?`,
      'Their devices are signed out and their private lists and tasks are hidden. Nothing is deleted: restoring them brings it all back.',
      act(() => api.removeMember(member.id)),
      'Remove'
    );

  const restoreMember = (member: HouseholdMember) => act(() => api.restoreMember(member.id))();

  const signOutDevice = (device: HouseholdDevice) =>
    confirmDestructive(
      `Sign out "${device.name}"?`,
      'It will need a new code to sign in again.',
      act(() => api.revokeDevice(device.id)),
      'Sign out'
    );

  const members = view?.members ?? household?.members ?? [];
  const me = household?.me ?? null;

  return {
    view,
    error,
    setError,
    reload,
    api,
    me,
    admin: me?.role === 'admin',
    /** This device, when it signed in with a code rather than the server's token. */
    deviceId: household?.deviceId ?? null,
    live: members.filter((m) => !m.deletedAt),
    removed: members.filter((m) => m.deletedAt),
    devices: view?.devices ?? null,
    /** Whether `member` may be removed by the person signed in. */
    canRemove: (member: HouseholdMember) => me?.role === 'admin' && member.id !== me.id && member.id !== OWNER_ID,
    removeMember,
    restoreMember,
    signOutDevice,
  };
}

export type HouseholdAdmin = ReturnType<typeof useHouseholdAdmin>;

/** A device's owner, by name, or "Integration" for one that belongs to nobody. */
export function ownerName(admin: HouseholdAdmin, device: HouseholdDevice): string {
  if (device.userId === null) return 'Integration';
  return admin.view?.members.find((m) => m.id === device.userId)?.name ?? 'Someone';
}

export function seenLabel(device: HouseholdDevice): string {
  const iso = device.lastSeenAt ?? device.createdAt;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return device.lastSeenAt ? `Last seen ${when}` : `Added ${when}`;
}

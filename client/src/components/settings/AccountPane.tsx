import React, { useState } from 'react';
import { View } from 'react-native';
import { useTasks } from '../../data/TaskContext';
import { ApiError } from '../../data/api';
import { confirmAsync } from '../../data/confirm';
import { Group, Note, PAGE_GAP, Row } from './parts';
import { HouseholdAdmin, OWNER_ID } from './useHouseholdAdmin';

interface Props {
  household: HouseholdAdmin;
  /** Closes Settings, once leaving has taken this device back to the connect screen. */
  onLeft: () => void;
}

/**
 * Who is signed in here, and — for anyone but the owner — deleting the account
 * outright. Signing this device out sits with Switch server (`LeaveGroup`), where
 * the difference between the two is explained once.
 */
export default function AccountPane({ household, onLeft }: Props) {
  const { state, supportsFeature, disconnect, removeSavedServer } = useTasks();
  const [deleting, setDeleting] = useState(false);
  const { me, deviceId } = household;
  const thisDevice = deviceId ? household.devices?.find((d) => d.id === deviceId)?.name : null;

  const deleteAccount = async () => {
    const sure = await confirmAsync(
      'Delete your account?',
      "This permanently erases your account, your private lists, your Inbox and your own filters and folders from the server, and signs out all your devices. Shared lists you made stay with the household. This can't be undone.",
      'Delete account',
      true
    );
    if (!sure) return;
    setDeleting(true);
    try {
      await household.api.deleteAccount();
    } catch (err) {
      setDeleting(false);
      household.setError(err instanceof ApiError ? err.message : 'Could not delete your account.');
      return;
    }
    // The token died with the account, so forget this server here too.
    removeSavedServer(state.serverUrl);
    disconnect();
    onLeft();
  };

  return (
    <View style={{ gap: PAGE_GAP }}>
      {me && (
        <Group
          note={
            deviceId ? null : "This device uses the server's own access token. Other devices sign in with a code instead."
          }
        >
          <Row title="Name" value={me.name} />
          <Row divided title="Role" value={me.role === 'admin' ? 'Admin' : 'Member'} />
          <Row divided title="This device" value={deviceId ? (thisDevice ?? 'Signed in with a code') : 'Server token'} />
        </Group>
      )}

      {me && me.id !== OWNER_ID && supportsFeature('deleteAccount') && (
        <Group note="Erases your account and everything only you can see. Shared lists you made stay with the household.">
          <Row title="Delete my account" tone="danger" onPress={deleteAccount} busy={deleting} />
        </Group>
      )}

      {household.error ? <Note tone="error">{household.error}</Note> : null}
    </View>
  );
}

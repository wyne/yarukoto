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
 * Who is signed in here, and erasing it: a member deletes their own account, and
 * the owner — whose account is the server's own — erases the whole household.
 * Signing this device out sits with Switch server (`LeaveGroup`), where the
 * difference between the two is explained once.
 */
export default function AccountPane({ household, onLeft }: Props) {
  const { state, supportsFeature, disconnect, removeSavedServer } = useTasks();
  const [deleting, setDeleting] = useState(false);
  const { me, deviceId } = household;
  const thisDevice = deviceId ? household.devices?.find((d) => d.id === deviceId)?.name : null;

  const isOwner = me?.id === OWNER_ID;
  const feature = isOwner ? 'eraseHousehold' : 'deleteAccount';

  const erase = async () => {
    const sure = await confirmAsync(
      isOwner ? 'Erase everything on this server?' : 'Delete your account?',
      isOwner
        ? "This permanently erases every list, task, folder and filter on this server, removes everyone else in the household, signs out every device, and deletes the server's backups. This can't be undone."
        : "This permanently erases your account, your private lists, your Inbox, your own filters and folders, and every task you added to a shared list, and signs out all your devices. This can't be undone.",
      isOwner ? 'Erase everything' : 'Delete account',
      true
    );
    if (!sure) return;
    setDeleting(true);
    try {
      await (isOwner ? household.api.eraseHousehold() : household.api.deleteAccount());
    } catch (err) {
      setDeleting(false);
      household.setError(err instanceof ApiError ? err.message : 'Could not delete your account.');
      return;
    }
    // A member's token died with the account; the owner's server is empty. Either way, forget it here.
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

      {me && supportsFeature(feature) && (
        <Group
          note={
            isOwner
              ? "Your account is this server's own, so deleting it means erasing all of the household's data. The server keeps running, empty."
              : "Erases your account, everything only you can see, and every task you added to a shared list. Shared lists you made stay with the household if anyone else's tasks are in them."
          }
        >
          <Row title={isOwner ? 'Erase all data' : 'Delete my account'} tone="danger" onPress={erase} busy={deleting} />
        </Group>
      )}
      {me && !supportsFeature(feature) && (
        <Note>
          {isOwner
            ? 'To erase all data from the app, update the server. Until then, stop the server and delete its data folder.'
            : 'This server needs an update before you can delete your account from the app. Ask whoever runs it, or see yarukotoapp.com/privacy.html.'}
        </Note>
      )}

      {household.error ? <Note tone="error">{household.error}</Note> : null}
    </View>
  );
}

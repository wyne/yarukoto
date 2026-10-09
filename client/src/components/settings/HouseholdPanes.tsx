import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Pressable from '../HoverPressable';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { HouseholdDevice, HouseholdMember } from '../../data/types';
import { Group, ListButtons, Note, PAGE_GAP, Row } from './parts';
import { HouseholdAdmin, ownerName, seenLabel } from './useHouseholdAdmin';
import type { ApproveFor } from './AddDevicePane';

interface Props {
  household: HouseholdAdmin;
  /**
   * A desktop window: rows select, and the action sits on the selected row and
   * on the − under the list. On a phone a tap on a row is the action itself,
   * after a confirmation, so no row needs a red button of its own.
   */
  desktop: boolean;
  onAdd: (as: ApproveFor) => void;
}

/** A small bordered button on a selected desktop row. */
function RowButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const styles = useStyles();
  const accent = useAccent();
  return (
    <Pressable onPress={onPress} style={styles.rowButton} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={[styles.rowButtonText, danger ? styles.danger : { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

export function PeoplePane({ household, desktop, onAdd }: Props) {
  const { me, admin, live, removed } = household;
  const [selected, setSelected] = useState<string | null>(null);
  if (!me) return null;

  const label = (m: HouseholdMember) => `${m.name}${m.id === me.id ? ' (you)' : ''}`;
  const role = (m: HouseholdMember) => (m.role === 'admin' ? 'Admin' : null);

  if (desktop) {
    const pick = [...live, ...removed].find((m) => m.id === selected) ?? null;
    const removable = pick && !pick.deletedAt && household.canRemove(pick) ? pick : null;
    return (
      <View style={{ gap: PAGE_GAP }}>
        <Group
          label="People"
          note={admin ? 'Removing someone hides their lists and tasks and signs their devices out. Restore brings it all back.' : null}
        >
          {live.map((m, i) => (
            <Row
              key={m.id}
              divided={i > 0}
              title={label(m)}
              value={role(m)}
              selected={admin ? selected === m.id : undefined}
              onPress={admin ? () => setSelected(m.id) : undefined}
              trailing={
                admin && selected === m.id && household.canRemove(m) ? (
                  <RowButton label="Remove…" danger onPress={() => household.removeMember(m)} />
                ) : null
              }
            />
          ))}
          {admin &&
            removed.map((m) => (
              <Row
                key={m.id}
                divided
                title={m.name}
                subtitle="Removed"
                selected={selected === m.id}
                onPress={() => setSelected(m.id)}
                trailing={<RowButton label="Restore" onPress={() => household.restoreMember(m)} />}
              />
            ))}
          {admin && (
            <ListButtons
              onAdd={() => onAdd('member')}
              addLabel="Add a person"
              onRemove={removable ? () => household.removeMember(removable) : undefined}
              removeLabel="Remove the selected person"
            />
          )}
        </Group>
        {household.error ? <Note tone="error">{household.error}</Note> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: PAGE_GAP }}>
      <Group note={admin ? 'Tap someone to remove them. Nothing is deleted: restoring them brings it all back.' : null}>
        {live.map((m, i) => (
          <Row
            key={m.id}
            divided={i > 0}
            title={label(m)}
            value={role(m)}
            onPress={household.canRemove(m) ? () => household.removeMember(m) : undefined}
          />
        ))}
      </Group>
      {admin && removed.length > 0 && (
        <Group label="Removed" note="Tap someone to restore them, with their lists and tasks.">
          {removed.map((m, i) => (
            <Row key={m.id} divided={i > 0} title={m.name} onPress={() => household.restoreMember(m)} />
          ))}
        </Group>
      )}
      {admin && (
        <Group>
          <Row title="Add a person…" tone="action" onPress={() => onAdd('member')} />
        </Group>
      )}
      {household.error ? <Note tone="error">{household.error}</Note> : null}
    </View>
  );
}

export function DevicesPane({ household, desktop, onAdd }: Props) {
  const { me, admin, devices, deviceId } = household;
  const [selected, setSelected] = useState<string | null>(null);
  if (!me) return null;
  if (devices === null) {
    return household.error ? <Note tone="error">{household.error}</Note> : <ActivityIndicator style={{ alignSelf: 'flex-start' }} />;
  }

  const isThis = (d: HouseholdDevice) => d.id === deviceId;
  // This device leaves through Sign out under Account, which also forgets the server here.
  const canSignOut = (d: HouseholdDevice) => !isThis(d);

  if (desktop) {
    const pick = devices.find((d) => d.id === selected && canSignOut(d)) ?? null;
    return (
      <View style={{ gap: PAGE_GAP }}>
        <Group
          label={admin ? 'Devices' : 'Your devices'}
          note="A device that is signed out needs a new code to sign in again."
        >
          {devices.length === 0 && <Row title="No devices have signed in with a code yet." />}
          {devices.map((d, i) => (
            <Row
              key={d.id}
              divided={i > 0}
              title={d.name}
              subtitle={
                isThis(d)
                  ? 'This device'
                  : [admin && d.userId !== me.id ? ownerName(household, d) : null, seenLabel(d)].filter(Boolean).join(' · ')
              }
              selected={selected === d.id}
              onPress={() => setSelected(d.id)}
              trailing={
                selected === d.id && canSignOut(d) ? (
                  <RowButton label="Sign out…" danger onPress={() => household.signOutDevice(d)} />
                ) : null
              }
            />
          ))}
          <ListButtons
            onAdd={() => onAdd('self')}
            addLabel="Add a device"
            onRemove={pick ? () => household.signOutDevice(pick) : undefined}
            removeLabel="Sign out the selected device"
          />
        </Group>
        {household.error ? <Note tone="error">{household.error}</Note> : null}
      </View>
    );
  }

  // Grouped by whose they are, which is the first thing anyone looks for.
  const groups: Array<{ label: string; items: HouseholdDevice[] }> = [
    { label: 'Yours', items: devices.filter((d) => d.userId === me.id) },
    { label: 'Household', items: devices.filter((d) => d.userId !== null && d.userId !== me.id) },
    { label: 'Integrations', items: devices.filter((d) => d.userId === null) },
  ].filter((g) => g.items.length > 0);

  return (
    <View style={{ gap: PAGE_GAP }}>
      {groups.length === 0 && <Note>No devices have signed in with a code yet.</Note>}
      {groups.map((g, gi) => (
        <Group
          key={g.label}
          label={groups.length > 1 ? g.label : undefined}
          note={gi === groups.length - 1 ? 'Tap a device to sign it out. It will need a new code to sign in again.' : null}
        >
          {g.items.map((d, i) => (
            <Row
              key={d.id}
              divided={i > 0}
              title={d.name}
              subtitle={
                isThis(d)
                  ? 'This device'
                  : [g.label === 'Household' ? ownerName(household, d) : null, seenLabel(d)].filter(Boolean).join(' · ')
              }
              onPress={canSignOut(d) ? () => household.signOutDevice(d) : undefined}
            />
          ))}
        </Group>
      ))}
      <Group>
        <Row title="Add a device…" tone="action" onPress={() => onAdd('self')} />
      </Group>
      {household.error ? <Note tone="error">{household.error}</Note> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  rowButton: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: c.dividerStrong,
    borderRadius: 6,
    backgroundColor: c.surface,
  },
  rowButtonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
  },
  danger: {
    color: c.priorityHigh,
  },
}));

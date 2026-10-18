import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import SyncIndicator from '../SyncIndicator';
import { useSyncStatus, useTasks } from '../../data/TaskContext';
import { ServerInfo, createApi } from '../../data/api';
import { lastSyncedLabel } from '../../data/dateUtils';
import { Group, PAGE_GAP, Row } from './parts';

/** e.g. "v1.0.0 · 366ba58" — enough to tell two builds apart at a glance. */
function buildLabel(info: ServerInfo): string {
  const parts = [info.version ? `v${info.version}` : null, info.commitShort].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'version unknown';
}

/** Local calendar date, since the exact minute isn't what you're checking for. */
function formatBuiltAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * What this device is connected to, and the way to point it somewhere else.
 *
 * The address isn't edited in place: Switch server returns to the first-run
 * screen, which is where a URL and token get entered, and keeps this sign-in in
 * the saved-servers list so coming back is one tap.
 */
export default function ServerPane({ onLeft }: { onLeft: () => void }) {
  const { state } = useTasks();
  const syncStatus = useSyncStatus();
  const [info, setInfo] = useState<ServerInfo | null | undefined>(undefined);

  // Which build the server is running, re-read each time this is shown so it
  // reflects a deploy that happened while the app stayed put. /health needs no
  // token, so this works even when the stored one has been rejected.
  useEffect(() => {
    let cancelled = false;
    createApi(state.serverUrl, '')
      .health()
      .then((result) => {
        if (!cancelled) setInfo(result);
      });
    return () => {
      cancelled = true;
    };
  }, [state.serverUrl]);

  return (
    <View style={{ gap: PAGE_GAP }}>
      <Group>
        {/* The indicator names the host when all is well and the problem when not. */}
        <Row value={lastSyncedLabel(new Date(), syncStatus.lastSyncedAt)} mono>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SyncIndicator mode={state.mode} serverUrl={state.serverUrl} />
          </View>
        </Row>
        <Row divided title="Address" value={state.serverUrl} mono />
        {info && <Row divided title="Server build" value={buildLabel(info)} mono />}
        {info?.builtAt && <Row divided title="Built" value={formatBuiltAt(info.builtAt)} />}
      </Group>

      <LeaveGroup onLeft={onLeft} />
    </View>
  );
}

/**
 * The two ways off this server, side by side so the difference is read in one
 * place: Switch server keeps the sign-in saved for coming back with one tap;
 * Sign out forgets it here, so getting back in takes the token or a new code.
 */
export function LeaveGroup({ onLeft }: { onLeft: () => void }) {
  const { state, disconnect, removeSavedServer } = useTasks();
  return (
    <Group note="Switch server keeps this sign-in saved on this device, so you can come back with one tap. Sign out forgets it here.">
      <Row
        title="Switch server"
        tone="action"
        onPress={() => {
          disconnect();
          onLeft();
        }}
      />
      <Row
        divided
        title="Sign out"
        tone="danger"
        onPress={() => {
          removeSavedServer(state.serverUrl);
          disconnect();
          onLeft();
        }}
      />
    </Group>
  );
}

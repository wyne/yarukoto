import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import NativeOwnedTextInput from '../NativeOwnedTextInput';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { ApiError, ApproveAs, HouseholdView, codeFromPairingLink, createApi, createPairingApi, joinLink, parseJoinLink } from '../../data/api';
import QrCode from './QrCode';
import QrScanner, { CAN_SCAN } from './QrScanner';
import { confirmDestructive } from '../../data/confirm';
import { HouseholdDevice, HouseholdMember } from '../../data/types';

interface Props {
  visible: boolean;
  /** A code from a scanned sign-in QR, to approve without typing it. */
  initialCode?: string | null;
}

type ApproveFor = ApproveAs['as'];

const APPROVE_OPTIONS: Array<{ value: ApproveFor; label: string }> = [
  { value: 'self', label: 'My device' },
  { value: 'member', label: 'New person' },
  { value: 'integration', label: 'Integration' },
];

/** How often a shown QR checks whether it has been scanned. */
const INVITE_CHECK_MS = 2000;

/** The id migration 008 gives the household's first admin, who cannot be removed. */
const OWNER_ID = 'u-owner';

function formatClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'it expires' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function seenLabel(device: HouseholdDevice): string {
  const iso = device.lastSeenAt ?? device.createdAt;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return device.lastSeenAt ? `Last seen ${when}` : `Added ${when}`;
}

/**
 * People and devices, in Settings.
 *
 * Everyone can approve a sign-in for another device of their own and sign
 * their devices out. The admin can also let new people and integrations in,
 * see every device, and remove people — softly: a removed person's lists and
 * tasks are hidden, not deleted, and Restore brings them all back.
 */
export default function HouseholdSection({ visible, initialCode }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const accent = useAccent();
  const { state, household, refreshHousehold } = useTasks();
  const [view, setView] = useState<HouseholdView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [approveFor, setApproveFor] = useState<ApproveFor>('self');
  const [newName, setNewName] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveMessage, setApproveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [invite, setInvite] = useState<{
    link: string;
    expiresAt: string;
    /** The device the approval created, which the scanning phone will sign in as. */
    deviceId: string;
    deviceName: string;
  } | null>(null);
  const [inviting, setInviting] = useState(false);

  const me = household?.me ?? null;
  const admin = me?.role === 'admin';
  const api = createApi(state.serverUrl, state.token);

  const load = useCallback(async () => {
    try {
      setView(await createApi(state.serverUrl, state.token).household());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load the household.');
    }
  }, [state.serverUrl, state.token]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  useEffect(() => {
    if (visible && initialCode) {
      setCode(initialCode);
      setApproveMessage(null);
    }
  }, [visible, initialCode]);

  /**
   * Notices the scan. This device cannot poll the pairing (that would claim the
   * token itself), but the device the approval created is already in the list
   * and gets a last-seen time on its first request: that is the phone arriving.
   */
  useEffect(() => {
    if (!visible || !invite) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const next = await createApi(state.serverUrl, state.token)
        .household()
        .catch(() => null);
      if (cancelled) return;
      const arrived = next?.devices.find((d) => d.id === invite.deviceId && d.lastSeenAt);
      if (next && arrived) {
        setView(next);
        setInvite(null);
        setApproveMessage({ ok: true, text: `"${invite.deviceName}" is signed in.` });
        refreshHousehold();
        return;
      }
      if (Date.parse(invite.expiresAt) < Date.now()) {
        setInvite(null);
        setApproveMessage({ ok: false, text: 'That QR expired before anyone scanned it.' });
        return;
      }
      timer = setTimeout(check, INVITE_CHECK_MS);
    };
    timer = setTimeout(check, INVITE_CHECK_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, invite, state.serverUrl, state.token, refreshHousehold]);

  if (!household || !me) return null;

  const nameOf = (id: string | null) =>
    id === null ? 'Integration' : (view?.members.find((m) => m.id === id)?.name ?? 'Someone');

  const approveAs = (): ApproveAs =>
    approveFor === 'member'
      ? { as: 'member', name: newName.trim() }
      : approveFor === 'integration'
        ? { as: 'integration' }
        : { as: 'self' };

  /**
   * Starts a pairing on the new phone's behalf and approves it on the spot, so
   * the QR can carry the finished sign-in. This device never polls it: a poll
   * is what claims the token, and it belongs to whoever scans.
   */
  const showInvite = async () => {
    const how = approveAs();
    if (how.as === 'member' && !how.name) {
      setApproveMessage({ ok: false, text: 'Give the new person a name.' });
      return;
    }
    setInviting(true);
    setApproveMessage(null);
    try {
      const pairing = await createPairingApi(state.serverUrl).start(
        how.as === 'member' ? `${how.name}'s phone` : 'Phone'
      );
      const approved = await api.approvePairing(pairing.code, how);
      setInvite({
        link: joinLink(state.serverUrl, pairing),
        expiresAt: pairing.expiresAt,
        deviceId: approved.device.id,
        deviceName: approved.device.name,
      });
    } catch (err) {
      setApproveMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not make a QR.' });
    } finally {
      setInviting(false);
    }
  };

  /** Approves the typed code, or one just read off the other device's QR. */
  const approve = async (scanned?: string) => {
    const value = scanned ?? code;
    const how = approveAs();
    if (how.as === 'member' && !how.name) {
      setApproveMessage({ ok: false, text: 'Give the new person a name.' });
      return;
    }
    setApproving(true);
    setApproveMessage(null);
    try {
      const result = await api.approvePairing(value, how);
      setCode('');
      setNewName('');
      setApproveFor('self');
      setApproveMessage({
        ok: true,
        text: result.member
          ? `${result.member.name} is in. Their device will finish signing in by itself.`
          : `Approved. "${result.device.name}" will finish signing in by itself.`,
      });
      await Promise.all([load(), refreshHousehold()]);
    } catch (err) {
      setApproveMessage({ ok: false, text: err instanceof ApiError ? err.message : 'That did not work.' });
    } finally {
      setApproving(false);
    }
  };

  const act = (run: () => Promise<unknown>) => async () => {
    let failure: string | null = null;
    try {
      await run();
    } catch (err) {
      failure = err instanceof ApiError ? err.message : 'That did not work.';
    }
    await Promise.all([load(), refreshHousehold()]);
    // After the reload, which clears the error line when it succeeds: a failed
    // sign-out must not vanish the moment the list redraws.
    if (failure) setLoadError(failure);
  };

  const confirmRemove = (member: HouseholdMember) =>
    confirmDestructive(
      `Remove ${member.name}?`,
      'Their devices are signed out and their private lists and tasks are hidden. Nothing is deleted: restoring them brings it all back.',
      act(() => api.removeMember(member.id)),
      'Remove'
    );

  const confirmSignOut = (device: HouseholdDevice) =>
    confirmDestructive(
      `Sign out "${device.name}"?`,
      'It will need a new code to sign in again.',
      act(() => api.revokeDevice(device.id)),
      'Sign out'
    );

  const members = view?.members ?? household.members;
  const live = members.filter((m) => !m.deletedAt);
  const removed = members.filter((m) => m.deletedAt);

  return (
    <View>
      <Text style={styles.sectionLabel}>Household</Text>
      <Text style={styles.signedIn}>
        Signed in as <Text style={styles.strong}>{me.name}</Text>
        {admin ? ' (admin)' : ''}
      </Text>
      {!household.deviceId && (
        <Text style={styles.note}>
          This device uses the server's own access token. Other devices can sign in with a code instead.
        </Text>
      )}

      <Text style={styles.subLabel}>Add a device</Text>
      {admin && (
        <View style={styles.segment} accessibilityRole="radiogroup">
          {APPROVE_OPTIONS.map((option) => {
            const selected = option.value === approveFor;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setApproveFor(option.value);
                  setInvite(null);
                }}
                style={[styles.segmentOption, selected && styles.segmentSelected]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {admin && approveFor === 'member' && (
        <NativeOwnedTextInput
          sheet
          value={newName}
          onChangeText={(text) => {
            setNewName(text);
            setInvite(null);
          }}
          placeholder="Their name"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { marginTop: 8 }]}
          accessibilityLabel="New person's name"
        />
      )}

      {/* A phone has a camera, so it scans: this device shows everything it
          needs, server address included. An integration has no camera and
          is added by the code it shows instead. */}
      {approveFor !== 'integration' &&
        (invite ? (
          <View style={styles.inviteBox}>
            <View style={styles.qrFrame}>
              <QrCode value={invite.link} size={188} color="#111" background="#fff" />
            </View>
            <Text style={styles.inviteHelp}>
              Scan this with the new phone's camera. It opens Yarukoto and signs in, with nothing to type. It works
              once, until {formatClock(invite.expiresAt)}.
            </Text>
            <Text style={styles.note}>
              No camera? On the new device choose Sign in with a code instead, and enter its code below.
            </Text>
            <Pressable
              onPress={() => {
                setInvite(null);
                load();
                refreshHousehold();
              }}
              hitSlop={6}
            >
              <Text style={[styles.action, { color: accent }]}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.primaryBtn, inviting && styles.approveBtnDisabled]}
            onPress={showInvite}
            disabled={inviting}
          >
            {inviting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.approveText}>
                {approveFor === 'member' ? 'Show a QR for them to scan' : 'Show a QR to scan'}
              </Text>
            )}
          </Pressable>
        ))}

      <Text style={styles.note}>
        {approveFor === 'integration'
          ? 'Enter the code Home Assistant shows. An integration sees only shared lists.'
          : 'Or, if the new device is showing a code, enter it here:'}
      </Text>
      <View style={[styles.approveRow, { marginTop: 6 }]}>
        <NativeOwnedTextInput
          sheet
          value={code}
          onChangeText={(text) => {
            setCode(text);
            setApproveMessage(null);
          }}
          placeholder="ABCD-2345"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.codeInput]}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Sign-in code"
        />
        <Pressable
          style={[styles.approveBtn, (!code.trim() || approving) && styles.approveBtnDisabled]}
          onPress={() => approve()}
          disabled={!code.trim() || approving}
        >
          {approving ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveText}>Approve</Text>}
        </Pressable>
      </View>
      {CAN_SCAN && (
        <Pressable onPress={() => setScanning(true)} hitSlop={6} style={{ marginTop: 8 }}>
          <Text style={[styles.action, { color: accent }]}>Scan its QR instead</Text>
        </Pressable>
      )}
      {CAN_SCAN && (
        <QrScanner
          visible={scanning}
          onClose={() => setScanning(false)}
          title="Scan the new device's QR"
          onScan={(data) => {
            const scannedCode = codeFromPairingLink(data);
            if (!scannedCode) {
              return parseJoinLink(data)
                ? 'That QR signs a new phone in. Scan the one the new device shows instead.'
                : 'That isn’t a Yarukoto sign-in QR.';
            }
            setScanning(false);
            setCode(scannedCode);
            approve(scannedCode);
            return null;
          }}
        />
      )}
      {approveMessage && (
        <Text style={[styles.note, { color: approveMessage.ok ? colors.success : colors.priorityHigh }]}>
          {approveMessage.text}
        </Text>
      )}

      <Text style={styles.subLabel}>People</Text>
      {live.map((member) => (
        <View key={member.id} style={styles.row}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {member.name}
            {member.id === me.id ? ' (you)' : ''}
          </Text>
          {member.role === 'admin' && <Text style={styles.rowMeta}>Admin</Text>}
          {admin && member.id !== me.id && member.id !== OWNER_ID && (
            <Pressable onPress={() => confirmRemove(member)} hitSlop={6}>
              <Text style={styles.danger}>Remove</Text>
            </Pressable>
          )}
        </View>
      ))}
      {admin &&
        removed.map((member) => (
          <View key={member.id} style={styles.row}>
            <Text style={[styles.rowTitle, styles.removed]} numberOfLines={1}>
              {member.name}
            </Text>
            <Text style={styles.rowMeta}>Removed</Text>
            <Pressable onPress={act(() => api.restoreMember(member.id))} hitSlop={6}>
              <Text style={[styles.action, { color: accent }]}>Restore</Text>
            </Pressable>
          </View>
        ))}
      {admin && (
        <Text style={styles.note}>
          To add someone, choose New person above, enter their name, and have them scan the QR with their phone.
        </Text>
      )}

      <Text style={styles.subLabel}>{admin ? 'Devices' : 'Your devices'}</Text>
      {view === null && !loadError && <ActivityIndicator color={accent} style={{ alignSelf: 'flex-start' }} />}
      {view?.devices.map((device) => (
        <View key={device.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {device.name}
              {device.id === household.deviceId ? ' (this device)' : ''}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {[admin && device.userId !== me.id ? nameOf(device.userId) : null, seenLabel(device)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {/* This device leaves through Disconnect, which also forgets the server here. */}
          {device.id !== household.deviceId && (
            <Pressable onPress={() => confirmSignOut(device)} hitSlop={6}>
              <Text style={styles.danger}>Sign out</Text>
            </Pressable>
          )}
        </View>
      ))}
      {view?.devices.length === 0 && <Text style={styles.note}>No devices have signed in with a code yet.</Text>}
      {loadError && <Text style={[styles.note, { color: colors.priorityHigh }]}>{loadError}</Text>}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  sectionLabel: {
    marginTop: 4,
    marginBottom: 8,
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  subLabel: {
    marginTop: 16,
    marginBottom: 6,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: c.textSecondary,
  },
  signedIn: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textSecondary,
  },
  strong: {
    fontFamily: fonts.sansSemiBold,
    color: c.textPrimary,
  },
  note: {
    marginTop: 6,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 17,
    color: c.textFaint,
  },
  approveRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
    backgroundColor: c.surface,
  },
  codeInput: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    letterSpacing: 1.5,
  },
  approveBtn: {
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.inverseSurface,
  },
  primaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: c.inverseSurface,
  },
  inviteBox: {
    marginTop: 10,
    padding: 14,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    backgroundColor: c.surface,
  },
  qrFrame: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  inviteHelp: {
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 19,
    color: c.textSecondary,
  },
  approveBtnDisabled: {
    backgroundColor: c.textFaint,
  },
  approveText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: c.inverseText,
  },
  segment: {
    flexDirection: 'row',
    marginTop: 8,
    padding: 3,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
  },
  segmentOption: {
    flex: 1,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 6,
  },
  segmentSelected: {
    backgroundColor: c.surface,
    borderColor: c.dividerStrong,
  },
  segmentText: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.textSecondary,
  },
  segmentTextSelected: {
    fontFamily: fonts.sansMedium,
    color: c.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  rowTitle: {
    flexShrink: 1,
    flexGrow: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
  },
  rowSub: {
    marginTop: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: c.textTertiary,
  },
  rowMeta: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
  removed: {
    color: c.textTertiary,
    textDecorationLine: 'line-through',
  },
  action: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  danger: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: c.priorityHigh,
  },
}));

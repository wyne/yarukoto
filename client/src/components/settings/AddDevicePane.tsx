import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Pressable from '../HoverPressable';
import NativeOwnedTextInput from '../NativeOwnedTextInput';
import QrCode from '../household/QrCode';
import QrScanner, { CAN_SCAN } from '../household/QrScanner';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useColors } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { ApiError, ApproveAs, codeFromPairingLink, createApi, createPairingApi, joinLink, parseJoinLink } from '../../data/api';
import { Group, Note, PAGE_GAP, Row, Segmented } from './parts';
import { HouseholdAdmin } from './useHouseholdAdmin';

export type ApproveFor = ApproveAs['as'];

const APPROVE_OPTIONS: Array<{ value: ApproveFor; label: string }> = [
  { value: 'self', label: 'Me' },
  { value: 'member', label: 'New person' },
  { value: 'integration', label: 'Integration' },
];

/** How often a shown QR checks whether it has been scanned. */
const INVITE_CHECK_MS = 2000;

function formatClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'it expires' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface Props {
  household: HouseholdAdmin;
  /** Who the new device is for, as picked by whatever opened this. */
  initialFor: ApproveFor;
  /** A code from a scanned sign-in QR, to approve without typing it. */
  initialCode?: string | null;
}

/**
 * Letting another device in, as its own step rather than a form that sits open
 * at the top of Settings.
 *
 * A phone has a camera, so the usual way is for this device to show a QR that
 * carries the whole sign-in. A device that shows a code of its own — or an
 * integration, which has no camera — is approved by entering that code.
 *
 * Everyone can add a device of their own; only the admin can let in a new
 * person or an integration.
 */
export default function AddDevicePane({ household, initialFor, initialCode }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const { state } = useTasks();
  const { admin, api, reload } = household;
  const [approveFor, setApproveFor] = useState<ApproveFor>(admin ? initialFor : 'self');
  const [newName, setNewName] = useState('');
  const [code, setCode] = useState(initialCode ?? '');
  const [showCode, setShowCode] = useState(!!initialCode);
  const [scanning, setScanning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [invite, setInvite] = useState<{
    link: string;
    expiresAt: string;
    /** The device the approval created, which the scanning phone will sign in as. */
    deviceId: string;
    deviceName: string;
  } | null>(null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      setShowCode(true);
      setMessage(null);
    }
  }, [initialCode]);

  /**
   * Notices the scan. This device cannot poll the pairing (that would claim the
   * token itself), but the device the approval created is already in the list
   * and gets a last-seen time on its first request: that is the phone arriving.
   */
  useEffect(() => {
    if (!invite) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const next = await createApi(state.serverUrl, state.token)
        .household()
        .catch(() => null);
      if (cancelled) return;
      const arrived = next?.devices.find((d) => d.id === invite.deviceId && d.lastSeenAt);
      if (next && arrived) {
        setInvite(null);
        setMessage({ ok: true, text: `"${invite.deviceName}" is signed in.` });
        reload();
        return;
      }
      if (Date.parse(invite.expiresAt) < Date.now()) {
        setInvite(null);
        setMessage({ ok: false, text: 'That QR expired before anyone scanned it.' });
        return;
      }
      timer = setTimeout(check, INVITE_CHECK_MS);
    };
    timer = setTimeout(check, INVITE_CHECK_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [invite, state.serverUrl, state.token, reload]);

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
      setMessage({ ok: false, text: 'Give the new person a name.' });
      return;
    }
    setInviting(true);
    setMessage(null);
    try {
      const pairing = await createPairingApi(state.serverUrl).start(how.as === 'member' ? `${how.name}'s phone` : 'Phone');
      const approved = await api.approvePairing(pairing.code, how);
      setInvite({
        link: joinLink(state.serverUrl, pairing),
        expiresAt: pairing.expiresAt,
        deviceId: approved.device.id,
        deviceName: approved.device.name,
      });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not make a QR.' });
    } finally {
      setInviting(false);
    }
  };

  /** Approves the typed code, or one just read off the other device's QR. */
  const approve = async (scanned?: string) => {
    const value = scanned ?? code;
    const how = approveAs();
    if (how.as === 'member' && !how.name) {
      setMessage({ ok: false, text: 'Give the new person a name.' });
      return;
    }
    setApproving(true);
    setMessage(null);
    try {
      const result = await api.approvePairing(value, how);
      setCode('');
      setNewName('');
      setMessage({
        ok: true,
        text: result.member
          ? `${result.member.name} is in. Their device will finish signing in by itself.`
          : `Approved. "${result.device.name}" will finish signing in by itself.`,
      });
      await reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'That did not work.' });
    } finally {
      setApproving(false);
    }
  };

  const pickFor = (value: ApproveFor) => {
    setApproveFor(value);
    setInvite(null);
    setMessage(null);
  };

  // An integration has no camera, so a code is the only way it is added.
  const codeOnly = approveFor === 'integration';

  return (
    <View style={{ gap: PAGE_GAP }}>
      {admin && (
        <View>
          <Text style={styles.label}>Who is it for?</Text>
          <Segmented options={APPROVE_OPTIONS} value={approveFor} onChange={pickFor} />
          {approveFor === 'member' && (
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
        </View>
      )}

      {!codeOnly &&
        (invite ? (
          <View style={styles.inviteBox}>
            <View style={styles.qrFrame}>
              <QrCode value={invite.link} size={188} color="#111" background="#fff" />
            </View>
            <Text style={styles.inviteHelp}>
              Scan this with the new phone's camera. It opens Yarukoto and signs in, with nothing to type. It works once,
              until {formatClock(invite.expiresAt)}.
            </Text>
          </View>
        ) : (
          <Pressable
            style={[styles.primaryBtn, inviting && styles.btnDisabled]}
            onPress={showInvite}
            disabled={inviting}
            accessibilityRole="button"
          >
            {inviting ? (
              <ActivityIndicator color={colors.inverseText} />
            ) : (
              <Text style={styles.btnText}>
                {approveFor === 'member' ? 'Show a QR for them to scan' : 'Show a QR to scan'}
              </Text>
            )}
          </Pressable>
        ))}

      {codeOnly || showCode ? (
        <View>
          <Text style={styles.label}>
            {codeOnly ? 'Enter the code Home Assistant shows. An integration sees only shared lists.' : 'The code the new device shows'}
          </Text>
          <View style={styles.approveRow}>
            <NativeOwnedTextInput
              sheet
              value={code}
              onChangeText={(text) => {
                setCode(text);
                setMessage(null);
              }}
              placeholder="ABCD-2345"
              placeholderTextColor={colors.textFaint}
              style={[styles.input, styles.codeInput]}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Sign-in code"
            />
            <Pressable
              style={[styles.approveBtn, (!code.trim() || approving) && styles.btnDisabled]}
              onPress={() => approve()}
              disabled={!code.trim() || approving}
              accessibilityRole="button"
            >
              {approving ? <ActivityIndicator color={colors.inverseText} /> : <Text style={styles.btnText}>Approve</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {!codeOnly && (!showCode || CAN_SCAN) && (
        <Group note={showCode ? null : 'No camera on the new device? Choose Sign in with a code there, then enter its code here.'}>
          {!showCode && <Row title="Enter a code instead" chevron onPress={() => setShowCode(true)} />}
          {CAN_SCAN && <Row divided={!showCode} title="Scan its QR instead" chevron onPress={() => setScanning(true)} />}
        </Group>
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
            setShowCode(true);
            setCode(scannedCode);
            approve(scannedCode);
            return null;
          }}
        />
      )}

      {message && <Note tone={message.ok ? 'ok' : 'error'}>{message.text}</Note>}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  label: {
    marginBottom: 6,
    paddingHorizontal: 4,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 17,
    color: c.textTertiary,
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
  approveRow: {
    flexDirection: 'row',
    gap: 8,
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
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: c.inverseSurface,
  },
  btnDisabled: {
    backgroundColor: c.textFaint,
  },
  btnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: c.inverseText,
  },
  inviteBox: {
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
}));

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import HoverPressable from '../HoverPressable';
import { useHoverBg } from '../../theme/hover';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { ApiError, Pairing, createPairingApi, pairingLink } from '../../data/api';
import { MAC } from '../../data/platform';
import QrCode from './QrCode';

/** Often enough that approval feels immediate, rarely enough to be no load. */
const POLL_MS = 2000;

/** How long the Copy button says Copied before it reads Copy again. */
const COPIED_MS = 1500;

/**
 * What this device is called in the Devices list. Only the kind: iOS has not
 * handed apps the user's own name for a phone since iOS 16.
 */
function deviceName(): string {
  if (Platform.OS === 'web') return 'Web browser';
  if (MAC) return 'Mac';
  if (Platform.OS === 'ios') return Platform.isPad ? 'iPad' : 'iPhone';
  return 'Android phone';
}

interface Props {
  serverUrl: string;
  /** Called once, with this device's own token, when someone approves it. */
  onApproved: (token: string) => Promise<void>;
  onCancel: () => void;
}

type Phase =
  | { kind: 'starting' }
  | { kind: 'waiting'; pairing: Pairing }
  | { kind: 'connecting' }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

/**
 * Signing in without a password: this device shows a code, and someone already
 * signed in approves it from Settings, or by scanning the QR with their phone.
 * The token arrives on the next poll, which only this device can make — the
 * code alone, which has been on a screen, never yields one.
 */
export default function PairingPanel({ serverUrl, onApproved, onCancel }: Props) {
  const styles = useStyles();
  const accent = useAccent();
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const onApprovedRef = useRef(onApproved);
  onApprovedRef.current = onApproved;

  useEffect(() => {
    const api = createPairingApi(serverUrl);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setPhase({ kind: 'starting' });

    const poll = async (pairing: Pairing) => {
      try {
        const result = await api.poll(pairing);
        if (cancelled) return;
        if (result.status === 'pending') {
          timer = setTimeout(() => poll(pairing), POLL_MS);
          return;
        }
        setPhase({ kind: 'connecting' });
        await onApprovedRef.current(result.token);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 410) setPhase({ kind: 'expired' });
        // Offline for a moment is not a failed sign-in; keep asking.
        else if (err instanceof ApiError && err.status === 0) timer = setTimeout(() => poll(pairing), POLL_MS);
        else setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Signing in failed.' });
      }
    };

    api
      .start(deviceName())
      .then((pairing) => {
        if (cancelled) return;
        setPhase({ kind: 'waiting', pairing });
        timer = setTimeout(() => poll(pairing), POLL_MS);
      })
      .catch((err) => {
        if (!cancelled) setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Could not start signing in.' });
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [serverUrl, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <View style={styles.panel}>
      {phase.kind === 'waiting' ? (
        <>
          <Text style={styles.label}>Your sign-in code</Text>
          <SignInCode code={phase.pairing.code} />
          <View style={styles.qrFrame}>
            <QrCode value={pairingLink(phase.pairing.code)} size={168} color="#111" background="#fff" />
          </View>
          <Text style={styles.help}>
            On a phone that's already signed in, scan this with the camera, or open Settings, then Household, and
            enter the code. Anyone in your household can approve their own devices; new people need the admin.
          </Text>
          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={accent} />
            <Text style={styles.waitingText}>Waiting for approval…</Text>
          </View>
        </>
      ) : phase.kind === 'expired' ? (
        <>
          <Text style={styles.help}>That code expired before anyone approved it.</Text>
          <Pressable style={styles.primaryBtn} onPress={retry}>
            <Text style={styles.primaryText}>Get a new code</Text>
          </Pressable>
        </>
      ) : phase.kind === 'error' ? (
        <>
          <Text style={styles.error}>{phase.message}</Text>
          <Pressable style={styles.primaryBtn} onPress={retry}>
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.waitingRow}>
          <ActivityIndicator size="small" color={accent} />
          <Text style={styles.waitingText}>{phase.kind === 'connecting' ? 'Approved. Signing in…' : 'Getting a code…'}</Text>
        </View>
      )}
      <Pressable onPress={onCancel} style={styles.cancelBtn} hitSlop={6}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

/**
 * The code, in a form the person can take with them as well as read off.
 *
 * React Native's `selectable` Text on iOS only offers a Copy menu on a long
 * press, never a drag selection, and on the Mac nobody presses and holds a
 * mouse button to find one. There the code is a read-only text view instead,
 * which selects with a drag or a double click and copies with ⌘C like any
 * other text. A Copy button covers every platform, and is quicker than either.
 */
function SignInCode({ code }: { code: string }) {
  const styles = useStyles();
  const hoverBg = useHoverBg();
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    // A browser that refuses the write resolves false rather than throwing;
    // saying Copied then would paste whatever was on the clipboard before.
    let ok = false;
    try {
      ok = await Clipboard.setStringAsync(code);
    } catch {
      ok = false;
    }
    setCopied(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };

  const label = `Code ${code.split('').join(' ')}`;
  return (
    <>
      {MAC ? (
        <TextInput
          value={code}
          editable={false}
          multiline
          scrollEnabled={false}
          style={[styles.code, styles.codeField]}
          accessibilityLabel={label}
        />
      ) : (
        <Text style={styles.code} selectable accessibilityLabel={label}>
          {code}
        </Text>
      )}
      <HoverPressable
        onPress={copy}
        style={hoverBg(styles.copyBtn)}
        accessibilityRole="button"
        accessibilityLabel={copied === 'copied' ? 'Code copied' : 'Copy code'}
        accessibilityLiveRegion="polite"
      >
        <Text style={[styles.copyText, copied === 'copied' && styles.copiedText]}>
          {copied === 'copied' ? 'Copied' : 'Copy code'}
        </Text>
      </HoverPressable>
      {copied === 'failed' && (
        <Text style={styles.copyFailed} accessibilityLiveRegion="polite">
          Couldn't copy. Select the code above and copy it instead.
        </Text>
      )}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  panel: {
    marginTop: 28,
    padding: 18,
    alignItems: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
  },
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  code: {
    marginTop: 6,
    fontFamily: fonts.monoRegular,
    fontSize: 30,
    letterSpacing: 3,
    color: c.textPrimary,
  },
  codeField: {
    // A text view pads its text and draws no frame; strip the padding so the
    // code sits where the Text version would.
    padding: 0,
    paddingTop: 0,
    paddingBottom: 0,
    textAlign: 'center',
    minWidth: 200,
  },
  copyBtn: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: c.border,
  },
  copyText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: c.textSecondary,
  },
  copiedText: {
    color: c.success,
  },
  copyFailed: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.priorityHigh,
  },
  qrFrame: {
    marginTop: 14,
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  help: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 19,
    color: c.textSecondary,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  waitingText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textTertiary,
  },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    color: c.priorityHigh,
  },
  primaryBtn: {
    marginTop: 14,
    alignSelf: 'stretch',
    backgroundColor: c.inverseSurface,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.inverseText,
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 6,
  },
  cancelText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.textTertiary,
  },
}));

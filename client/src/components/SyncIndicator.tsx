import React, { useEffect, useRef } from 'react';
import { useColors } from '../theme/ThemeContext';
import { Animated, Easing, Text, View } from 'react-native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { AppMode } from '../data/storage';
import { SyncStatus } from '../data/sync';
import { useSyncStatus } from '../data/TaskContext';
import { elapsedShort } from '../data/dateUtils';

interface Props {
  mode: AppMode;
  serverUrl: string;
  /** Collapsed sidebar shows the dot alone. */
  compact?: boolean;
}

const SYNC_PULSE_LOW_OPACITY = 0.35;
const SYNC_PULSE_DOWN_MS = 260;
const SYNC_PULSE_HOLD_MS = 120;
const SYNC_PULSE_UP_MS = 520;

/**
 * The dot's colour carries the state; the label says what to do about it.
 *
 * When everything is fine the label is the server host rather than the word
 * "Synced" — a green dot already says that, and the host is the more useful
 * thing to see at a glance.
 */
function describe(mode: AppMode, status: SyncStatus, serverUrl: string, now: Date): { color: string; label: string } {
  const colors = useColors();
  const host = serverUrl.replace(/^https?:\/\//, '');
  const stale = status.lastSyncedAt ? elapsedShort(now, status.lastSyncedAt) : null;

  if (mode === 'sample') return { color: colors.textFaint, label: 'Sample data' };
  if (mode !== 'server') return { color: colors.textFaint, label: 'Not connected' };

  // Labels stay short: the sidebar is narrow, and a truncated message helps nobody.
  switch (status.state) {
    case 'syncing':
      return { color: colors.success, label: host || 'Connected' };
    case 'pending':
      return { color: colors.priorityMedium, label: `${status.pending} pending` };
    case 'offline':
      // Unsaved work outranks staleness: if something is queued, that's the fact
      // you'd act on. Otherwise how long you've been out of touch is the useful one.
      return {
        color: colors.priorityMedium,
        label:
          status.pending > 0
            ? `Offline · ${status.pending} pending`
            : stale
              ? `Offline · ${stale}`
              : 'Offline',
      };
    case 'unauthorized':
      return { color: colors.priorityHigh, label: 'Token rejected' };
    case 'synced':
    default:
      return { color: colors.success, label: host || 'Connected' };
  }
}

export default function SyncIndicator({ mode, serverUrl, compact }: Props) {
  const styles = useStyles();
  // Read here rather than passed in, so a status change re-renders the indicator
  // alone and not the sidebar or sheet around it.
  const status = useSyncStatus();
  // Recomputed on each render, which the 5s sync cycle already triggers — so the
  // elapsed time stays current without a timer of its own.
  const { color, label } = describe(mode, status, serverUrl, new Date());

  // A slow pulse while syncing, so the indicator reads as live without being a
  // spinner competing for attention.
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseRunning = useRef(false);
  const keepPulsing = useRef(false);
  const mounted = useRef(true);
  const active = mode === 'server' && status.state === 'syncing';
  const scale = pulse.interpolate({
    inputRange: [SYNC_PULSE_LOW_OPACITY, 1],
    outputRange: [1.18, 1],
  });

  useEffect(() => {
    if (!active) {
      keepPulsing.current = false;
      return;
    }

    keepPulsing.current = true;
    if (pulseRunning.current) return;

    pulseRunning.current = true;
    const runPulse = () => {
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: SYNC_PULSE_LOW_OPACITY,
          duration: SYNC_PULSE_DOWN_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(SYNC_PULSE_HOLD_MS),
        Animated.timing(pulse, {
          toValue: 1,
          duration: SYNC_PULSE_UP_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished || !mounted.current) {
          pulseRunning.current = false;
          return;
        }
        if (keepPulsing.current) {
          runPulse();
          return;
        }
        pulseRunning.current = false;
      });
    };

    runPulse();
  }, [active, pulse]);

  useEffect(() => {
    return () => {
      mounted.current = false;
      keepPulsing.current = false;
      pulse.stopAnimation();
    }
  }, [pulse]);

  return (
    <>
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: color,
            opacity: pulse,
            transform: [{ scale }],
          },
        ]}
      />
      {!compact && (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 13.5,
    color: c.textTertiary,
  },
}));

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { AppMode } from '../data/storage';
import { SyncStatus } from '../data/sync';
import { elapsedShort } from '../data/dateUtils';

interface Props {
  mode: AppMode;
  status: SyncStatus;
  serverUrl: string;
  /** Collapsed sidebar shows the dot alone. */
  compact?: boolean;
}

/**
 * The dot's colour carries the state; the label says what to do about it.
 *
 * When everything is fine the label is the server host rather than the word
 * "Synced" — a green dot already says that, and the host is the more useful
 * thing to see at a glance.
 */
function describe(mode: AppMode, status: SyncStatus, serverUrl: string, now: Date): { color: string; label: string } {
  const host = serverUrl.replace(/^https?:\/\//, '');
  const stale = status.lastSyncedAt ? elapsedShort(now, status.lastSyncedAt) : null;

  if (mode === 'sample') return { color: colors.textFaint, label: 'Sample data' };
  if (mode !== 'server') return { color: colors.textFaint, label: 'Not connected' };

  // Labels stay short: the sidebar is narrow, and a truncated message helps nobody.
  switch (status.state) {
    case 'syncing':
      return { color: colors.textTertiary, label: 'Syncing…' };
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

export default function SyncIndicator({ mode, status, serverUrl, compact }: Props) {
  // Recomputed on each render, which the 5s sync cycle already triggers — so the
  // elapsed time stays current without a timer of its own.
  const { color, label } = describe(mode, status, serverUrl, new Date());

  // A slow pulse while syncing, so the indicator reads as live without being a
  // spinner competing for attention.
  const pulse = useRef(new Animated.Value(1)).current;
  const active = mode === 'server' && status.state === 'syncing';

  useEffect(() => {
    if (!active) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  return (
    <>
      <Animated.View style={[styles.dot, { backgroundColor: color, opacity: pulse }]} />
      {!compact && (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.textTertiary,
  },
});

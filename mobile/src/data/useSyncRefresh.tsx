import React, { useCallback, useState } from 'react';
import { Platform, RefreshControl, RefreshControlProps } from 'react-native';
import { colors } from '../theme/colors';
import { useTasks } from './TaskContext';
import { hapticAction } from './haptics';

/** Shortest spin that still reads as a deliberate answer rather than a flicker. */
const MIN_SPIN_MS = 600;

/**
 * Pull-to-refresh for a list of server-backed records, as a ready
 * `refreshControl` prop.
 *
 * The sync loop runs on its own timer regardless. This is for the moment you
 * suspect it hasn't, which on a phone is answered by pulling the list, not by
 * hunting for a button.
 *
 * Present in every native mode, including the sample dataset where the pull has
 * nothing to fetch. A gesture that works on one screen and is silently missing
 * on the next reads as broken, and "nothing came back" is a fine answer for it
 * to give. Undefined only on the web, which has a reload button and no pull
 * gesture to speak of.
 */
export function useSyncRefresh(): React.ReactElement<RefreshControlProps> | undefined {
  const { syncNow } = useTasks();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    // Fired on release past the threshold, which is the moment the gesture
    // commits — the same beat UIKit ticks on, and the confirmation that the pull
    // was far enough before the spinner has had time to say so.
    hapticAction();
    setRefreshing(true);
    try {
      // A cycle that resolves at once — nothing queued, or no server to talk to
      // — would flick the spinner out mid-appearance, which reads as the pull
      // having failed. Hold it long enough to be seen as an answer.
      await Promise.all([syncNow(), new Promise((r) => setTimeout(r, MIN_SPIN_MS))]);
    } finally {
      setRefreshing(false);
    }
  }, [syncNow]);

  if (Platform.OS === 'web') return undefined;

  return (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
  );
}

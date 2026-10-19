import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Sheet, { useDesktopPresentation } from './Sheet';
import { popoverPlacement, PopoverAnchor } from './Popover';
import ActivityChanges, { eventColor } from './ActivityChanges';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useColors } from '../theme/ThemeContext';
import { createApi } from '../data/api';
import { useTasks } from '../data/TaskContext';
import { ActivityItem, dayKey, dayLabel, summarize, timeLabel } from '../data/activityItems';
import { useWindowSelector } from './useWindowSelector';

/** How much of the window the history may take before it scrolls instead. */
const MAX_HEIGHT_RATIO = 0.7;
/** The popover's title row and padding, which sit outside its scrolling body. */
const POPOVER_CHROME = 64;
/** Shortest the popover's body gets, so a cramped spot still shows a few entries. */
const POPOVER_MIN_BODY = 160;

interface Props {
  visible: boolean;
  onClose: () => void;
  taskId: string;
  /** Forwarded to Sheet: a point makes this a popover on the desktop, none a dialog. */
  anchor?: PopoverAnchor | null;
}

/**
 * One task's change history, read-only: the Activity tab's entries for just this
 * task, described by the same code so an edit reads the same in both.
 *
 * It is the server's record, fetched each time it opens, so an edit made here
 * shows once it has synced. Only offered when the server advertises
 * `taskHistory`; local and sample mode keep no history to show.
 */
export default function TaskHistorySheet({ visible, onClose, taskId, anchor }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const { state } = useTasks();
  const desktop = useDesktopPresentation();
  const height = useWindowSelector((window) => window.height);
  const maxHeight = Math.round(height * MAX_HEIGHT_RATIO);
  // The link sits at the foot of the task, so the popover often has less of the
  // window than the sheet would; it scrolls within what is left beside the link.
  const popoverBody = anchor
    ? Math.max(POPOVER_MIN_BODY, Math.min(maxHeight, popoverPlacement(anchor, height).room - POPOVER_CHROME))
    : maxHeight;
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible || state.mode !== 'server') return;
    let cancelled = false;
    setItems(null);
    setError(false);
    const now = new Date();
    createApi(state.serverUrl, state.token)
      .taskHistory(taskId)
      .then((revisions) => {
        if (!cancelled) setItems(revisions.flatMap((revision) => summarize(revision, now, state.lists)));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // Fetched once per opening; the lists only name where a move went.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, taskId, state.mode, state.serverUrl, state.token]);

  const groups = useMemo(() => {
    const byDay = new Map<string, ActivityItem[]>();
    for (const item of items ?? []) {
      const key = dayKey(item.recordedAt);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return Array.from(byDay.entries());
  }, [items]);

  const empty = error ? 'History could not be loaded.' : items === null ? 'Loading history...' : 'No history yet.';

  const body =
    groups.length === 0 ? (
      <Text style={styles.empty}>{empty}</Text>
    ) : (
      groups.map(([day, dayItems]) => (
        <View key={day} style={styles.group}>
          <Text style={styles.day}>{dayLabel(day)}</Text>
          {dayItems.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: eventColor(item.kind, colors) }]} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: eventColor(item.kind, colors) }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {!!item.detail && (
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.detail}
                  </Text>
                )}
                {!!item.changes?.length && <ActivityChanges changes={item.changes} />}
              </View>
              <Text style={styles.time}>{timeLabel.format(new Date(item.recordedAt))}</Text>
            </View>
          ))}
        </View>
      ))
    );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="History"
      anchor={anchor}
      popoverWidth={380}
      dialogWidth={460}
      stackBehavior="push"
      scroll
      maxHeight={maxHeight}
    >
      {/* The phone's sheet and the desktop dialog scroll themselves; a popover does not. */}
      {desktop && anchor ? <ScrollView style={{ maxHeight: popoverBody }}>{body}</ScrollView> : body}
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  empty: {
    textAlign: 'center',
    paddingVertical: 24,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
  group: {
    marginBottom: 10,
  },
  day: {
    marginTop: 4,
    marginBottom: 2,
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
  time: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
}));

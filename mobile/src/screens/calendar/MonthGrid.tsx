import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { alpha, priorityColor } from '../../theme/colors';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { addDays, addMonths, buildMonthGrid, isSameDay, startOfDay, startOfWeek, toISODate } from '../../data/dateUtils';
import { Task } from '../../data/types';
import Card from '../../components/Card';
import { dayTargetId } from '../../drag/hitTest';
import { taskIdsFromDrag } from '../../drag/DragContext';
import { useDropTarget } from '../../drag/useDropTarget';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A 30px day badge in a cell padded 2px top and bottom. */
const CELL_HEIGHT = 34;
/**
 * A month spans five weeks or six. The grid reserves six either way, so the
 * card's height doesn't move as the pager slides from one month to the next —
 * and doesn't drag whatever is below it up and down on every swipe.
 */
const GRID_HEIGHT = CELL_HEIGHT * 6;
/** The finger's journey from six rows down to one. */
const COLLAPSE_TRAVEL = GRID_HEIGHT - CELL_HEIGHT;

/** Matched to the drawer's swipe, which is the other horizontal gesture here. */
const SWIPE_ACTIVATE_X = 20;
const SWIPE_FAIL_Y = 15;
const SWIPE_FLING = 350;
/** A quarter of the way across commits without needing a flick. */
const SWIPE_COMMIT = 0.25;
const COLLAPSE_ACTIVATE_Y = 12;
const COLLAPSE_FLING = 400;
const PAGE_MS = 220;
const PAGE_EASING = Easing.out(Easing.cubic);

function priorityWeight(p: Task['priority']): number {
  return { high: 3, medium: 2, low: 1, none: 0 }[p];
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

interface Props {
  monthAnchor: Date;
  selectedDate: Date;
  today: Date;
  byDate: Map<string, Task[]>;
  onSelectDate: (date: Date) => void;
  onChangeMonth: (date: Date) => void;
  /** Plan view only: makes every day cell a drop target for scheduling. */
  onDropTask?: (taskIds: string[], iso: string) => void;
  /** Shades the span the day-column views are showing, so the grid doubles as a locator. */
  rangeStart?: Date;
  rangeEnd?: Date;
  /** Open on one week rather than the whole month. Restored between sessions. */
  weekView?: boolean;
  onWeekViewChange?: (weekView: boolean) => void;
}

/**
 * The month, swipeable sideways to change month and draggable upwards to shrink
 * to the week the selected day is in — which hands the height back to whatever
 * the screen puts below the calendar.
 *
 * Three pages sit side by side on a track so the one being swiped towards moves
 * with the finger rather than appearing when it lifts. A page is a month, or a
 * single week once collapsed: sideways then steps a week at a time, and takes
 * the selected day with it so the list below follows.
 *
 * Pages are placed by an absolute page number that only ever counts up or down,
 * never by their position in the rendered window. That is what makes committing
 * a page free: the slide leaves the track on page n+1 and stays there, and when
 * React catches up the window becomes {n, n+1, n+2} — the two pages that were
 * already on screen keep the coordinates they had, one off-screen page unmounts
 * and another mounts. Nothing moves, so there is nothing to catch mid-move.
 *
 * Recentring the track after each commit is the obvious alternative and it is
 * the one that flickers: the reset is a write to the UI thread while the new
 * pages arrive through the renderer, and on the frames where the renderer wins
 * you see the page past the one you asked for.
 *
 * A month changed from outside — the arrows, Today, collapsing to a week — moves
 * no page either. The window is derived from the anchor, so the same coordinates
 * simply hold different dates.
 *
 * Collapsing keeps the month drawn until the shrink has finished, because a
 * month clipped to the selected week's row is the same thing as that week.
 * Opening runs it backwards: the month is put back the moment the finger starts
 * pulling down, while there is still only one row showing to see it in.
 */
export default function MonthGrid({
  monthAnchor,
  selectedDate,
  today,
  byDate,
  onSelectDate,
  onChangeMonth,
  onDropTask,
  rangeStart,
  rangeEnd,
  weekView = false,
  onWeekViewChange,
}: Props) {
  const styles = useStyles();
  /** A page's width in pixels, which is what places them. Zero until first layout. */
  const [width, setWidth] = useState(0);
  /**
   * Which page the track is parked on, counting from wherever it started. It has
   * no meaning beyond spacing the pages out — only that it moves by exactly the
   * one page the slide moved by.
   */
  const [page, setPage] = useState(0);

  const pageWidth = useSharedValue(0);
  const scrollX = useSharedValue(0);
  /** Where the track was when the current sideways drag took hold. */
  const grabbedX = useSharedValue(0);
  /** 1 is the whole month, 0 is the single week. */
  const expand = useSharedValue(weekView ? 0 : 1);
  /** Where `expand` was when the current vertical drag took hold. */
  const grabbed = useSharedValue(0);
  /** Cleared once a committed page has landed, so a second swipe can't outrun it. */
  const paging = useSharedValue(false);
  const swiping = useSharedValue(false);

  /**
   * Whether the pages are weeks. Follows the prop, but leads it while opening:
   * the month has to be on screen before it can be grown into.
   */
  const [weeks, setWeeks] = useState(weekView);
  useEffect(() => setWeeks(weekView), [weekView]);

  const pages = useMemo(() => {
    if (weeks) {
      const start = startOfWeek(selectedDate);
      return [addDays(start, -7), start, addDays(start, 7)];
    }
    return [addMonths(monthAnchor, -1), monthAnchor, addMonths(monthAnchor, 1)];
  }, [weeks, selectedDate, monthAnchor]);

  /** Which row of the month the selected day sits on — the one a collapse keeps. */
  const selectedRow = useMemo(() => {
    if (weeks) return 0;
    const grid = buildMonthGrid(monthAnchor);
    const at = grid.findIndex(({ date }) => isSameDay(date, selectedDate));
    return at < 0 ? 0 : Math.floor(at / 7);
  }, [weeks, monthAnchor, selectedDate]);

  // Only when the page width itself changes, which means a rotation or a resize.
  // `page` is deliberately not a dependency: the swipe path keeps the track and
  // the page number in step by moving both by exactly one page, and writing the
  // track's position from here on every commit is the flicker this design exists
  // to avoid.
  useLayoutEffect(() => {
    pageWidth.value = width;
    scrollX.value = -page * width;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // The commit has landed, so a fresh swipe can be taken.
  useLayoutEffect(() => {
    paging.value = false;
  }, [page, paging]);

  const commitPage = useCallback(
    (delta: number) => {
      setPage((n) => n + delta);
      if (!weeks) {
        onChangeMonth(addMonths(monthAnchor, delta));
        return;
      }
      // A week step carries the selected day with it, so the list below the
      // calendar moves to the week you are looking at rather than staying behind.
      const next = addDays(selectedDate, delta * 7);
      onSelectDate(next);
      onChangeMonth(startOfMonth(next));
    },
    [weeks, monthAnchor, selectedDate, onSelectDate, onChangeMonth]
  );

  const settleHeight = useCallback(
    (open: boolean) => {
      setWeeks(!open);
      if (weekView === open) onWeekViewChange?.(!open);
    },
    [weekView, onWeekViewChange]
  );

  /** The month has to exist before the drag can open it; clipped, it looks the same. */
  const beginOpening = useCallback(() => setWeeks(false), []);

  const swipe = Gesture.Pan()
    // Horizontal travel only, and enough of it that a tap on a day, or a scroll
    // of the screen this sits on, is never read as a page.
    .activeOffsetX([-SWIPE_ACTIVATE_X, SWIPE_ACTIVATE_X])
    .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
    .onBegin(() => {
      swiping.value = !paging.value;
      grabbedX.value = scrollX.value;
    })
    .onUpdate((e) => {
      if (swiping.value) scrollX.value = grabbedX.value + e.translationX;
    })
    .onEnd((e) => {
      if (!swiping.value) return;
      const w = pageWidth.value;
      // No layout yet, so there is no page width to commit against.
      if (w <= 0) {
        scrollX.value = grabbedX.value;
        return;
      }
      const far = Math.abs(e.translationX) > w * SWIPE_COMMIT;
      const flung = Math.abs(e.velocityX) > SWIPE_FLING;
      // Dragging left pulls the following page in from the right, and back again.
      const delta = far || flung ? Math.sign(-e.translationX) : 0;
      if (delta !== 0) paging.value = true;
      // Settles on the page's own coordinate and is left there. See the note on
      // the component: nothing puts the track back afterwards.
      scrollX.value = withTiming(
        grabbedX.value - delta * w,
        { duration: PAGE_MS, easing: PAGE_EASING },
        (done) => {
          if (done && delta !== 0) scheduleOnRN(commitPage, delta);
        }
      );
    });

  const collapse = Gesture.Pan()
    .activeOffsetY([-COLLAPSE_ACTIVATE_Y, COLLAPSE_ACTIVATE_Y])
    .failOffsetX([-SWIPE_ACTIVATE_X, SWIPE_ACTIVATE_X])
    .onStart((e) => {
      grabbed.value = expand.value;
      if (expand.value < 1 && e.translationY > 0) scheduleOnRN(beginOpening);
    })
    .onUpdate((e) => {
      expand.value = Math.min(1, Math.max(0, grabbed.value + e.translationY / COLLAPSE_TRAVEL));
    })
    .onEnd((e) => {
      // A flick decides on its own; a slow drag goes wherever it is nearer.
      const open =
        e.velocityY > COLLAPSE_FLING
          ? true
          : e.velocityY < -COLLAPSE_FLING
            ? false
            : expand.value > 0.5;
      expand.value = withTiming(open ? 1 : 0, { duration: PAGE_MS, easing: PAGE_EASING }, (done) => {
        if (done) scheduleOnRN(settleHeight, open);
      });
    });

  // Both read the same touch and neither can be half right, so whichever passes
  // its thresholds first takes it outright.
  const gesture = Gesture.Race(swipe, collapse);

  const viewport = useAnimatedStyle(() => ({
    height: CELL_HEIGHT + COLLAPSE_TRAVEL * expand.value,
  }));

  // The vertical step is what keeps the selected week in the one visible row as
  // the rest of the month closes over it.
  const rowOffset = selectedRow * CELL_HEIGHT;
  const track = useAnimatedStyle(() => ({
    transform: [{ translateX: scrollX.value }, { translateY: -rowOffset * (1 - expand.value) }],
  }));

  return (
    <Card style={styles.gridCard}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <Text key={i} style={styles.weekdayLetter}>
            {l}
          </Text>
        ))}
      </View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.viewport, viewport]}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View style={[styles.track, track]}>
            {pages.map((start, i) => {
              // Only the page on screen registers drop targets. Neighbouring pages
              // overlap at the edges — the 1st of a month appears in two month
              // grids — and ids are registry keys, so all three registering would
              // leave a day owned by a page that is off screen.
              const body = (
                <CalendarPage
                  start={start}
                  weeks={weeks}
                  selectedDate={selectedDate}
                  today={today}
                  byDate={byDate}
                  onSelectDate={onSelectDate}
                  onChangeMonth={onChangeMonth}
                  onDropTask={i === 1 ? onDropTask : undefined}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                />
              );
              // Nothing has been measured yet, so there is nowhere to put the
              // neighbours. The one being looked at fills the viewport, which is
              // where absolute placement puts it on the next frame anyway.
              if (width === 0) {
                return i === 1 ? (
                  <View key={toISODate(start)} style={styles.solePage}>
                    {body}
                  </View>
                ) : null;
              }
              return (
                <View
                  key={toISODate(start)}
                  style={[styles.page, { left: (page + i - 1) * width, width }]}
                >
                  {body}
                </View>
              );
            })}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </Card>
  );
}

/**
 * One page of the pager: a whole month's cells, or a single week's.
 *
 * A week's days are never dimmed. The row spans two months as often as not, and
 * greying half of it would say the calendar had lost track of where it was.
 */
function CalendarPage({
  start,
  weeks,
  selectedDate,
  today,
  byDate,
  onSelectDate,
  onChangeMonth,
  onDropTask,
  rangeStart,
  rangeEnd,
}: Omit<Props, 'monthAnchor' | 'weekView' | 'onWeekViewChange'> & { start: Date; weeks: boolean }) {
  const colors = useColors();
  const styles = useStyles();

  const cells = useMemo(
    () =>
      weeks
        ? Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), inMonth: true }))
        : buildMonthGrid(start),
    [weeks, start]
  );

  // Selecting a day in a week that has run into the next month has to take the
  // month with it, or opening the grid back up would land on the month behind.
  const select = useCallback(
    (date: Date) => {
      onSelectDate(date);
      if (weeks) onChangeMonth(startOfMonth(date));
    },
    [weeks, onSelectDate, onChangeMonth]
  );

  // Compared as day numbers so a partial-day time never shifts the band.
  const rangeFrom = rangeStart ? startOfDay(rangeStart).getTime() : null;
  const rangeTo = rangeEnd ? startOfDay(rangeEnd).getTime() : null;
  const rangeFor = (date: Date) => {
    if (rangeFrom === null || rangeTo === null) return { inRange: false, isFirst: false, isLast: false };
    const t = startOfDay(date).getTime();
    return { inRange: t >= rangeFrom && t <= rangeTo, isFirst: t === rangeFrom, isLast: t === rangeTo };
  };

  const dotColorFor = (iso: string): string | null => {
    const dayTasks = byDate.get(iso);
    if (!dayTasks || dayTasks.length === 0) return null;
    const top = dayTasks.reduce((best, t) => (priorityWeight(t.priority) > priorityWeight(best.priority) ? t : best));
    return top.priority === 'none' ? colors.textTertiary : priorityColor(top.priority, colors);
  };

  return (
    <View style={styles.grid}>
      {cells.map(({ date, inMonth }) => (
        <DayCell
          key={toISODate(date)}
          date={date}
          inMonth={inMonth}
          today={today}
          selectedDate={selectedDate}
          dot={dotColorFor(toISODate(date))}
          onSelectDate={select}
          onChangeMonth={onChangeMonth}
          onDropTask={onDropTask}
          {...rangeFor(date)}
        />
      ))}
    </View>
  );
}

interface CellProps {
  date: Date;
  inMonth: boolean;
  today: Date;
  selectedDate: Date;
  dot: string | null;
  onSelectDate: (d: Date) => void;
  onChangeMonth: (d: Date) => void;
  onDropTask?: (taskIds: string[], iso: string) => void;
  inRange: boolean;
  isFirst: boolean;
  isLast: boolean;
}

function DayCell({
  date,
  inMonth,
  today,
  selectedDate,
  dot,
  onSelectDate,
  onChangeMonth,
  onDropTask,
  inRange,
  isFirst,
  isLast,
}: CellProps) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const selectedBg = alpha(accent, 0.16);
  const iso = toISODate(date);
  const isToday = isSameDay(date, today);
  const isSelected = isSameDay(date, selectedDate) && !isToday && !inRange;

  const { ref, onLayout, isOver } = useDropTarget(
    dayTargetId(iso, 'month'),
    (payload) => onDropTask?.(taskIdsFromDrag(payload), iso),
    !!onDropTask
  );

  return (
    <View
      style={[
        styles.cell,
        // Banded on the outer cell, not the day badge, so consecutive days join up.
        inRange && { backgroundColor: selectedBg },
        inRange && isFirst && styles.cellRangeStart,
        inRange && isLast && styles.cellRangeEnd,
      ]}
      // Only measured and registered when the grid is droppable.
      ref={onDropTask ? ref : undefined}
      onLayout={onDropTask ? onLayout : undefined}
      collapsable={false}
    >
      <Pressable
        onPress={() => {
          onSelectDate(date);
          if (!inMonth) onChangeMonth(startOfMonth(date));
        }}
      >
        <View
          style={[
            styles.cellInner,
            isToday && { backgroundColor: accent },
            isSelected && { backgroundColor: selectedBg },
            !!onDropTask && isOver && { borderWidth: 2, borderColor: accent, backgroundColor: colors.accentTintBg },
          ]}
        >
          <Text
            style={[
              styles.cellText,
              !inMonth && { color: colors.textFaint },
              isToday && { color: '#fff', fontFamily: fonts.sansSemiBold },
            ]}
          >
            {date.getDate()}
          </Text>
          {dot && !isToday && <View style={[styles.dot, { backgroundColor: dot }]} />}
        </View>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  gridCard: {
    padding: 8,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLetter: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: c.textTertiary,
  },
  /** Clips the pages either side, and the weeks above and below. */
  viewport: {
    overflow: 'hidden',
  },
  track: {
    flex: 1,
  },
  /** Placed by page number, so a commit never has to move one. */
  page: {
    position: 'absolute',
    top: 0,
    height: GRID_HEIGHT,
  },
  solePage: {
    width: '100%',
    height: GRID_HEIGHT,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 2,
  },
  cellRangeStart: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  cellRangeEnd: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  cellInner: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: c.textPrimary,
  },
  dot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
}));

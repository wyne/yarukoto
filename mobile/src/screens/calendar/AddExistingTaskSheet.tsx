import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../../theme/styles';
import { priorityColor } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { getListById } from '../../data/selectors';
import { EMPTY_CRITERIA, TaskCriteria, filterTasks } from '../../data/taskFilter';
import { SortBy, sortTasks } from '../../data/viewOptions';
import { LIQUID_GLASS } from '../../data/platform';
import { nativeTabBarClearance } from '../../navigation/nativeTabBarLayout';
import { closeOpenSwipeRow } from '../../components/SwipeableRow';
import Card from '../../components/Card';
import Divider from '../../components/Divider';
import FilterBar from '../../components/browse/FilterBar';
import TaskRow from '../../components/TaskRow';
import { useDraggable } from '../../drag/useDraggable';
import { useDragActive } from '../../drag/DragContext';
import { useDragSource } from '../../drag/dragSource';
import { useDropTarget } from '../../drag/useDropTarget';
import { hapticSelect } from '../../data/haptics';
import { IconCalendarBox, IconPlus } from '../../icons/Icons';
import { Task } from '../../data/types';

interface ButtonProps {
  onPress: () => void;
}

interface SheetProps {
  visible: boolean;
  onClose: () => void;
}

const COLLAPSED_HEIGHT = 1;
const EXPANDED_HEIGHT = 430;
/** How far the handle can pull the sheet up, for a long list of tasks. */
const TALL_HEIGHT = '90%';
/**
 * A threshold the sheet's content gesture gives up at, standing it down for the
 * length of a task drag. One pixel of travel in any direction is enough.
 */
const FAIL_ON_ANY_MOVE: [number, number] = [-1, 1];
/** How far the cancel pill swells while a dragged task sits over it. */
const CANCEL_OVER_SCALE = 1.14;

export function AddExistingTaskButton({ onPress }: ButtonProps) {
  const styles = useStyles();
  const colors = useColors();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const dragging = useDragActive();
  const { ref, onLayout, isOver } = useDropTarget('calendar/cancel-add-existing', () => undefined);
  // Grey, not red: dropping here only calls the drag off, it destroys nothing.
  const tint = dragging ? colors.swipeLater : accent;
  // The pill swells under the dragged task. Scaling the inner pill rather than
  // the anchor leaves the measured drop rect where it was, so the target does
  // not chase the finger as it grows.
  const overStyle = useAnimatedStyle(
    () => ({ transform: [{ scale: withTiming(isOver ? CANCEL_OVER_SCALE : 1, { duration: 140 }) }] }),
    [isOver]
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.buttonAnchor,
        { bottom: nativeTabBarClearance(insets.bottom) },
        dragging && styles.buttonAnchorDragging,
      ]}
    >
      {/* The rect is measured here rather than on the full-width anchor above,
          so the drop zone is the pill itself and not the strip it sits in. */}
      <View ref={ref} onLayout={onLayout} collapsable={false}>
        <Pressable
          onPress={onPress}
          disabled={dragging}
          accessibilityRole="button"
          accessibilityLabel={dragging ? 'Cancel task drag' : 'Add existing task'}
        >
          <Animated.View style={overStyle}>
            {LIQUID_GLASS ? (
              <GlassView style={styles.glassButton} tintColor={tint} isInteractive={!dragging}>
                {!dragging && <IconPlus size={16} color="#fff" strokeWidth={2} />}
                <Text style={styles.glassButtonText}>
                  {dragging ? 'Drag here to cancel' : 'Add existing'}
                </Text>
              </GlassView>
            ) : (
              <View style={[styles.flatButton, { backgroundColor: tint }]}>
                {!dragging && <IconPlus size={16} color="#fff" strokeWidth={2} />}
                <Text style={styles.glassButtonText}>
                  {dragging ? 'Drag here to cancel' : 'Add existing'}
                </Text>
              </View>
            )}
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

export default function AddExistingTaskSheet({ visible, onClose }: SheetProps) {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state } = useTasks();
  const now = new Date();
  const dragging = useDragActive();
  const scrimOpacity = colors.scrimOpacity;
  const titleIconColor = colors.textSecondary;
  const [criteria, setCriteria] = useState<TaskCriteria>(EMPTY_CRITERIA);
  const [sortBy, setSortBy] = useState<SortBy>('manual');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const ref = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const presented = useRef(false);
  const expanding = useRef(false);

  // Three: shut, the height it opens at, and as far as it goes. The last is what
  // the handle has to pull against — with nothing above the opening height there
  // was nowhere for the drag to take it.
  const snapPoints = useMemo(
    () => [COLLAPSED_HEIGHT, EXPANDED_HEIGHT + Math.max(14, insets.bottom), TALL_HEIGHT],
    [insets.bottom]
  );

  useLayoutEffect(() => {
    if (!visible) return;
    Keyboard.dismiss();
    expanding.current = true;
    if (!presented.current) {
      presented.current = true;
      ref.current?.present();
      return;
    }
    ref.current?.snapToIndex(1);
  }, [visible]);

  useEffect(() => {
    if (dragging && presented.current) ref.current?.snapToIndex(0);
  }, [dragging]);

  const tasks = useMemo(
    () =>
      sortTasks(filterTasks(state.tasks, criteria, { lists: state.lists, now }), {
        groupBy: 'none',
        sortBy,
        arrangements: {},
      }),
    // `now` only affects date buckets; reopening/re-rendering catches changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [criteria, sortBy, state.lists, state.tasks]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const close = useCallback(() => {
    expanding.current = false;
    onClose();
    ref.current?.snapToIndex(0);
  }, [onClose]);

  const updateCriteria = useCallback((next: TaskCriteria) => {
    setSelectedIds([]);
    setCriteria(next);
  }, []);
  const updateSort = useCallback((next: SortBy) => {
    setSelectedIds([]);
    setSortBy(next);
  }, []);
  const toggleSelected = useCallback((taskId: string) => {
    hapticSelect();
    setSelectedIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    );
  }, []);
  // The payload has captured the ids by this point. Clearing here means the next
  // time the preserved sheet opens it starts ready for another assignment.
  const finishPickup = useCallback(() => {
    close();
    setSelectedIds([]);
  }, [close]);

  // The sheet renders a new backdrop *element type* whenever this callback
  // changes identity, and React answers a changed type by remounting: the scrim
  // is torn down and rebuilt mid-fade, which is the flicker on open and close.
  // So the press handler goes through a ref instead of into the dependencies,
  // leaving only the scheme's scrim opacity — which only a theme switch moves.
  const closeRef = useRef(close);
  closeRef.current = close;
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={1}
        disappearsOnIndex={0}
        // Still touch-through while shut, which is what lets a task be dragged out
        // of the sheet and onto the calendar underneath — the backdrop only takes
        // touches at all once the sheet is open (see its `pointerEvents`).
        enableTouchThrough
        pressBehavior="collapse"
        onPress={() => closeRef.current()}
        opacity={scrimOpacity}
      />
    ),
    [scrimOpacity]
  );

  /**
   * The title travels with the grabber rather than sitting in the content below
   * it, so the whole strip is a handle: everything here is inside the sheet's
   * pan gesture, and dragging the words resizes the sheet.
   *
   * Stable, for the reason the backdrop above is: a changed component identity
   * remounts what it draws.
   */
  const renderHandle = useCallback(
    () => (
      <View style={styles.handle}>
        <View style={styles.indicator} />
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <IconCalendarBox size={18} color={titleIconColor} />
            <Text style={styles.title}>Add existing</Text>
          </View>
          <Pressable
            onPress={() => closeRef.current()}
            accessibilityRole="button"
            accessibilityLabel="Close add existing"
          >
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
      </View>
    ),
    [styles, titleIconColor]
  );

  return (
    <BottomSheetModal
      ref={ref}
      index={1}
      snapPoints={snapPoints}
      enableDismissOnClose={false}
      enableDynamicSizing={false}
      /*
        Pulling the list moves the sheet once the list has no more to scroll —
        which puts this gesture after the same movement that carries a task out
        of the sheet, and gesture-handler cancels the touches under a recognizer
        it activates.

        It cannot simply be switched off for the length of a drag:
        `enableContentPanningGesture` decides which component the content is
        drawn in, so changing it would remount the list under the finger and take
        the drag with it. A threshold it fails at does the same job from outside
        — the first pixel of movement puts it out of the running, and the task
        keeps the touch.
      */
      failOffsetX={dragging ? FAIL_ON_ANY_MOVE : undefined}
      failOffsetY={dragging ? FAIL_ON_ANY_MOVE : undefined}
      enablePanDownToClose={false}
      enableOverDrag={false}
      backdropComponent={renderBackdrop}
      handleComponent={renderHandle}
      backgroundStyle={styles.background}
      style={styles.sheet}
      onChange={(index) => {
        if (index > 0) expanding.current = false;
        if (index === 0 && !expanding.current) onClose();
      }}
      onDismiss={() => {
        presented.current = false;
        onClose();
      }}
    >
      {/*
        A plain View, not BottomSheetView: that one positions itself absolutely
        with no bottom and no height, so it takes the height of what is in it and
        `flex: 1` inside means nothing. The list below it was then given a frame
        as tall as its own contents, hanging past the bottom of the sheet with
        nothing left to scroll. The sheet's content container has a real height,
        so filling it is all this needs to do.
      */}
      <View style={styles.content}>
        <TextInput
          value={criteria.query}
          onChangeText={(query) => updateCriteria({ ...criteria, query })}
          placeholder="Search tasks and tags"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <FilterBar
          criteria={criteria}
          onChange={updateCriteria}
          sortBy={sortBy}
          onSortChange={updateSort}
        />
        <Text style={styles.hint}>
          {selectedIds.length > 0
            ? `${selectedIds.length} selected. Long press a selected task to place ${
                selectedIds.length === 1 ? 'it' : 'them'
              } on the calendar.`
            : 'Long press a task to place it on the calendar. Tap tasks to select multiple.'}
        </Text>
        <BottomSheetScrollView
          style={styles.resultsFrame}
          showsVerticalScrollIndicator
          indicatorStyle="default"
          onScrollBeginDrag={closeOpenSwipeRow}
          // The inset rides on the content rather than the frame, so the last row
          // can be scrolled clear of the home indicator instead of stopping under it.
          contentContainerStyle={[styles.results, { paddingBottom: Math.max(14, insets.bottom) + 16 }]}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!dragging}
        >
          {tasks.length === 0 ? (
            <Text style={styles.empty}>{criteria.query.trim() ? 'No matches.' : 'Nothing to show.'}</Text>
          ) : (
            <Card>
              {tasks.map((task, i) => (
                <View key={task.id}>
                  <DraggableTask
                    task={task}
                    now={now}
                    selectedIds={selectedIds}
                    selected={selectedIdSet.has(task.id)}
                    onToggleSelected={() => toggleSelected(task.id)}
                    onPickup={finishPickup}
                  />
                  {i < tasks.length - 1 && <Divider />}
                </View>
              ))}
            </Card>
          )}
        </BottomSheetScrollView>
      </View>
    </BottomSheetModal>
  );
}

function DraggableTask({
  task,
  now,
  selectedIds,
  selected,
  onToggleSelected,
  onPickup,
}: {
  task: Task;
  now: Date;
  selectedIds: string[];
  selected: boolean;
  onToggleSelected: () => void;
  onPickup: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { state, toggleComplete, snoozeTask } = useTasks();
  const { onLongPress, ...handlers } = useDraggable({
    taskId: task.id,
    taskIds: selected ? selectedIds : [task.id],
    title: task.title,
  });
  const isSource = useDragSource(task.id);

  return (
    <View style={styles.draggable} {...handlers}>
      <TaskRow
        task={task}
        list={getListById(state.lists, task.listId)}
        now={now}
        showContext="tags"
        selectionMode
        selected={selected}
        selectionColor={priorityColor(task.priority, colors)}
        dragSource={isSource}
        onPress={onToggleSelected}
        onLongPress={(event) => {
          onLongPress(event);
          requestAnimationFrame(onPickup);
        }}
        onToggleComplete={() => toggleComplete(task.id)}
        onLater={() => snoozeTask(task.id)}
        onDone={() => toggleComplete(task.id)}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  buttonAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingLeft: 16,
    alignItems: 'flex-start',
    zIndex: 20,
  },
  /**
   * Centred while dragging: the FAB is gone by then, and a cancel target the
   * finger has to carry a task into the corner for is one the thumb can miss.
   */
  buttonAnchorDragging: {
    paddingLeft: 0,
    alignItems: 'center',
  },
  glassButton: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  flatButton: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: c.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  glassButtonText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  background: {
    backgroundColor: c.surface,
  },
  /** The grabber and the title, which together are what the sheet is dragged by. */
  handle: {
    paddingTop: 10,
  },
  indicator: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
  },
  content: {
    flex: 1,
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: c.textPrimary,
  },
  done: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.textTertiary,
  },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
    backgroundColor: c.chipBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  results: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  hint: {
    marginHorizontal: 16,
    marginBottom: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 13.5,
    color: c.textTertiary,
  },
  resultsFrame: {
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    marginTop: 28,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
  draggable: {
    ...({ userSelect: 'none', cursor: 'grab' } as object),
  },
}));

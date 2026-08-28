import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetHandle,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { getListById } from '../../data/selectors';
import { EMPTY_CRITERIA, TaskCriteria, filterTasks } from '../../data/taskFilter';
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
      <View ref={ref} onLayout={onLayout}>
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
  const [criteria, setCriteria] = useState<TaskCriteria>(EMPTY_CRITERIA);
  const ref = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const presented = useRef(false);
  const expanding = useRef(false);

  const snapPoints = useMemo(
    () => [COLLAPSED_HEIGHT, EXPANDED_HEIGHT + Math.max(14, insets.bottom)],
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
    () => filterTasks(state.tasks, criteria, { lists: state.lists, now }),
    // `now` only affects date buckets; reopening/re-rendering catches changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [criteria, state.lists, state.tasks]
  );

  const close = useCallback(() => {
    expanding.current = false;
    onClose();
    ref.current?.snapToIndex(0);
  }, [onClose]);

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
        enableTouchThrough
        pressBehavior="none"
        onPress={() => closeRef.current()}
        opacity={scrimOpacity}
      />
    ),
    [scrimOpacity]
  );

  return (
    <BottomSheetModal
      ref={ref}
      index={1}
      snapPoints={snapPoints}
      enableDismissOnClose={false}
      enableDynamicSizing={false}
      enableContentPanningGesture={false}
      enablePanDownToClose={false}
      enableOverDrag={false}
      backdropComponent={renderBackdrop}
      handleComponent={BottomSheetHandle}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={styles.background}
      style={styles.sheet}
      onChange={(index) => {
        if (index === 1) expanding.current = false;
        if (index === 0 && !expanding.current) onClose();
      }}
      onDismiss={() => {
        presented.current = false;
        onClose();
      }}
    >
      <BottomSheetView
        style={StyleSheet.flatten([
          styles.content,
          {
            paddingBottom: Math.max(14, insets.bottom),
          },
        ])}
      >
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <IconCalendarBox size={18} color={colors.textSecondary} />
            <Text style={styles.title}>Add existing</Text>
          </View>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close add existing">
            <Text style={[styles.done, { color: colors.textTertiary }]}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          value={criteria.query}
          onChangeText={(query) => setCriteria({ ...criteria, query })}
          placeholder="Search tasks and tags"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <FilterBar criteria={criteria} onChange={setCriteria} />
        <BottomSheetScrollView
          style={styles.resultsFrame}
          showsVerticalScrollIndicator
          indicatorStyle="default"
          onScrollBeginDrag={closeOpenSwipeRow}
          contentContainerStyle={styles.results}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!dragging}
        >
          {tasks.length === 0 ? (
            <Text style={styles.empty}>{criteria.query.trim() ? 'No matches.' : 'Nothing to show.'}</Text>
          ) : (
            <Card>
              {tasks.map((task, i) => (
                <View key={task.id}>
                  <DraggableTask task={task} now={now} onPickup={close} />
                  {i < tasks.length - 1 && <Divider />}
                </View>
              ))}
            </Card>
          )}
        </BottomSheetScrollView>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function DraggableTask({ task, now, onPickup }: { task: Task; now: Date; onPickup: () => void }) {
  const styles = useStyles();
  const { state, toggleComplete, snoozeTask } = useTasks();
  const { onLongPress, ...handlers } = useDraggable({ taskId: task.id, title: task.title });
  const isSource = useDragSource(task.id);

  return (
    <View style={styles.draggable} {...handlers}>
      <TaskRow
        task={task}
        list={getListById(state.lists, task.listId)}
        now={now}
        showContext="tags"
        dragSource={isSource}
        onPress={() => undefined}
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
  indicator: {
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

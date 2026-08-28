import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

export function AddExistingTaskButton({ onPress }: ButtonProps) {
  const styles = useStyles();
  const accent = useAccent();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.buttonAnchor, { bottom: nativeTabBarClearance(insets.bottom) }]}
    >
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Add existing task">
        {LIQUID_GLASS ? (
          <GlassView style={styles.glassButton} tintColor={accent} isInteractive>
            <IconPlus size={16} color="#fff" strokeWidth={2} />
            <Text style={styles.glassButtonText}>Add existing</Text>
          </GlassView>
        ) : (
          <View style={[styles.flatButton, { backgroundColor: accent }]}>
            <IconPlus size={16} color="#fff" strokeWidth={2} />
            <Text style={styles.glassButtonText}>Add existing</Text>
          </View>
        )}
      </Pressable>
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
      requestAnimationFrame(() => ref.current?.snapToIndex(1));
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

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={1}
        disappearsOnIndex={0}
        enableTouchThrough
        pressBehavior="none"
        onPress={close}
        opacity={colors.scrimOpacity}
      />
    ),
    [close, colors.scrimOpacity]
  );

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      enableDismissOnClose={false}
      enableDynamicSizing={false}
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
          showsVerticalScrollIndicator={false}
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
    left: 16,
    zIndex: 20,
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

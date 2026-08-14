import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useDetail } from '../navigation/DetailContext';
import SlideUpModal from './SlideUpModal';
import TaskDetailView from './TaskDetailView';

/** Narrow-layout presentation: the task detail as a pull-up sheet over the list. */
export default function TaskDetailSheet() {
  const { openTaskId, closeTask } = useDetail();
  const insets = useSafeAreaInsets();
  // Held so the sheet still has content to render while it slides back out.
  const lastTaskId = useRef(openTaskId);
  useEffect(() => {
    if (openTaskId) lastTaskId.current = openTaskId;
  }, [openTaskId]);

  const taskId = openTaskId ?? lastTaskId.current;
  if (!taskId) return null;

  return (
    <SlideUpModal
      visible={!!openTaskId}
      onClose={closeTask}
      sheetStyle={[styles.sheet, { paddingBottom: insets.bottom }]}
    >
      <View style={styles.grabber} />
      <TaskDetailView taskId={taskId} onClose={closeTask} variant="sheet" />
    </SlideUpModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    // Leaves the top of the list peeking through, so the sheet reads as a layer.
    height: '92%',
    backgroundColor: colors.screenBg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
});

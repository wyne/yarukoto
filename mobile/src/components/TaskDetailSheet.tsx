import React, { useEffect, useRef } from 'react';
import { useDetail } from '../navigation/DetailContext';
import { colors } from '../theme/colors';
import NativeSheet from './NativeSheet';
import TaskDetailView from './TaskDetailView';

/** Narrow-layout presentation: the task detail as a pull-up sheet over the list. */
export default function TaskDetailSheet() {
  const { openTaskId, closeTask } = useDetail();
  // Held so the sheet still has content to render while it slides back out.
  const lastTaskId = useRef(openTaskId);
  useEffect(() => {
    if (openTaskId) lastTaskId.current = openTaskId;
  }, [openTaskId]);

  const taskId = openTaskId ?? lastTaskId.current;
  if (!taskId) return null;

  return (
    <NativeSheet
      visible={!!openTaskId}
      onClose={closeTask}
      // Leaves the top of the list peeking through, so the sheet reads as a layer.
      snapPoints={['92%']}
      background={colors.screenBg}
      // TaskDetailView draws its own header and padding; the sheet body must not pad again.
      contentStyle={styles.body}
    >
      <TaskDetailView taskId={taskId} onClose={closeTask} variant="sheet" />
    </NativeSheet>
  );
}

const styles = {
  body: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
} as const;

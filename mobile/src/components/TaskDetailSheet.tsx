import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useDetail } from '../navigation/DetailContext';
import TaskDetailView from './TaskDetailView';

/** Narrow-layout presentation: the task detail as a pull-up sheet over the list. */
export default function TaskDetailSheet() {
  const { openTaskId, closeTask } = useDetail();
  const insets = useSafeAreaInsets();

  if (!openTaskId) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeTask}>
      <Pressable style={styles.backdrop} onPress={closeTask} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
        <View style={styles.grabber} />
        <TaskDetailView taskId={openTaskId} onClose={closeTask} variant="sheet" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,20,15,0.35)',
  },
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

import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { BottomSheetFooter, BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import { useDetail } from '../navigation/DetailContext';
import { colors } from '../theme/colors';
import KeyboardDismissButton from './KeyboardDismissButton';
import NativeSheet from './NativeSheet';
import TaskDetailView from './TaskDetailView';

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // 'will' on iOS so the button arrives with the keyboard rather than after it.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * The keyboard-dismiss button, parked just above the keyboard.
 *
 * A sheet footer rather than an InputAccessoryView: the accessory view binds to a
 * single input — RCTInputAccessoryComponentView takes the first matching view on
 * didMoveToWindow and never re-binds — so on a form of five fields only one would
 * ever get a button. The footer is input-agnostic, and gorhom already offsets it by
 * the keyboard height.
 *
 * The gate matters: a footer renders unconditionally, so without it the button just
 * parks at the sheet's bottom edge whenever the keyboard is down.
 */
function KeyboardDismissFooter({ animatedFooterPosition }: BottomSheetFooterProps) {
  const keyboardVisible = useKeyboardVisible();
  return (
    <BottomSheetFooter animatedFooterPosition={animatedFooterPosition} bottomInset={0} style={styles.keyboardFooter}>
      {keyboardVisible ? (
        <View style={styles.keyboardFooterInner}>
          <KeyboardDismissButton />
        </View>
      ) : null}
    </BottomSheetFooter>
  );
}

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
      keyboard
      // Leaves the top of the list peeking through, so the sheet reads as a layer.
      snapPoints={['92%']}
      background={colors.screenBg}
      footerComponent={KeyboardDismissFooter}
      // TaskDetailView owns its horizontal layout; the sheet body must not pad again.
      contentStyle={styles.body}
    >
      <TaskDetailView taskId={taskId} onClose={closeTask} variant="sheet" />
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  keyboardFooter: {
    backgroundColor: 'transparent',
  },
  keyboardFooterInner: {
    alignItems: 'flex-end',
    paddingRight: 8,
    paddingBottom: 6,
  },
});

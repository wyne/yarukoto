import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet } from 'react-native';
import { BottomSheetFooter, BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import Animated, { Extrapolation, interpolate, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useDetail } from '../navigation/DetailContext';
import { useColors } from '../theme/ThemeContext';
import KeyboardDismissButton from './KeyboardDismissButton';
import NativeSheet from './NativeSheet';
import TaskDetailView from './TaskDetailView';

function KeyboardDismissFooter({ animatedFooterPosition }: BottomSheetFooterProps) {
  const keyboard = useAnimatedKeyboard();
  const [visible, setVisible] = useState(false);
  const keyboardStyle = useAnimatedStyle(() => {
    const exitOffset = interpolate(keyboard.height.value, [0, 48], [80, 0], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: -keyboard.height.value + exitOffset }],
    };
  });

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <BottomSheetFooter animatedFooterPosition={animatedFooterPosition} bottomInset={0} style={styles.keyboardFooter}>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.keyboardFooterInner, keyboardStyle]}
      >
        {visible ? <KeyboardDismissButton /> : null}
      </Animated.View>
    </BottomSheetFooter>
  );
}

/** Narrow-layout presentation: the task detail as a pull-up sheet over the list. */
export default function TaskDetailSheet() {
  const colors = useColors();
  const { openTaskId, closeTask } = useDetail();
  // Held so the sheet still has content to render while it slides back out.
  const lastTaskId = useRef(openTaskId);
  useEffect(() => {
    if (openTaskId) lastTaskId.current = openTaskId;
  }, [openTaskId]);

  const taskId = openTaskId ?? lastTaskId.current;

  return (
    <NativeSheet
      visible={!!openTaskId}
      onClose={closeTask}
      keyboard
      // Leaves the top of the list peeking through, so the sheet reads as a layer.
      snapPoints={['92%']}
      background={colors.screenBg}
      footerComponent={Platform.OS === 'ios' ? KeyboardDismissFooter : undefined}
      // TaskDetailView owns its horizontal layout and its own scroll tail
      // clearance; the sheet body must not pad again.
      contentStyle={styles.body}
    >
      {taskId ? (
        <TaskDetailView
          key={taskId}
          taskId={taskId}
          onClose={closeTask}
          variant="sheet"
          active={openTaskId === taskId}
        />
      ) : null}
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  keyboardFooter: {
    backgroundColor: 'transparent',
  },
  keyboardFooterInner: {
    height: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 8,
  },
});

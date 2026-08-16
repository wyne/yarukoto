import React from 'react';
import NativeSheet from './NativeSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * The app's standard picker sheet: a titled pull-up with a drag grabber.
 * Content-sized, swipeable down, keyboard-aware — all from NativeSheet.
 */
export default function BottomSheet({ visible, onClose, title, children }: Props) {
  return (
    <NativeSheet visible={visible} onClose={onClose} title={title}>
      {children}
    </NativeSheet>
  );
}

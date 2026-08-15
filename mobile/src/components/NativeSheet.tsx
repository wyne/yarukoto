import React, { useCallback, useEffect, useRef } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetHandle,
  BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Raise the sheet behind the keyboard instead of letting it cover the field. */
  keyboard?: boolean;
  /** Show the drag grabber; composers hide it so the input row sits at the top edge. */
  grabber?: boolean;
  /** Called once the sheet has been presented — the moment to focus an input. */
  onShow?: () => void;
  children: React.ReactNode;
}

/**
 * Bottom-sheet wrapper around @gorhom/bottom-sheet.
 *
 * Rendered as a native-driven modal with dynamic sizing (the sheet grows to its
 * content). Sheets with text fields set `keyboard` so the surface extends
 * behind the keyboard — content is pushed up, the rounded corners stay visible
 * above the keyboard, and the sheet rides the keyboard as one motion.
 */
export default function NativeSheet({ visible, onClose, title, keyboard, grabber = true, onShow, children }: Props) {
  const insets = useSafeAreaInsets();
  const ref = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;
  const shownRef = useRef(false);

  useEffect(() => {
    if (visible) {
      shownRef.current = false;
      ref.current?.present();
    } else {
      Keyboard.dismiss();
      ref.current?.dismiss();
    }
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" opacity={0.4} />
    ),
    []
  );

  const handleChange = useCallback((index: number) => {
    if (index >= 0 && !shownRef.current) {
      shownRef.current = true;
      onShowRef.current?.();
    }
  }, []);

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      enableOverDrag={false}
      keyboardBehavior={keyboard ? 'extend' : undefined}
      backdropComponent={renderBackdrop}
      handleComponent={grabber ? BottomSheetHandle : null}
      handleIndicatorStyle={styles.indicator}
      style={styles.sheet}
      backgroundStyle={styles.background}
      onChange={handleChange}
      onDismiss={() => onCloseRef.current?.()}
    >
      <View style={[styles.content, { paddingTop: title ? 0 : 16, paddingBottom: Math.max(16, insets.bottom) }]}>
        {!!title && <Text style={styles.title}>{title}</Text>}
        {children}
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  background: {
    backgroundColor: colors.surface,
  },
  indicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  content: {
    paddingHorizontal: 16,
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
});

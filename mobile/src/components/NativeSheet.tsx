import React, { useCallback, useEffect, useRef } from 'react';
import { Keyboard, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetHandle,
  BottomSheetModal,
  BottomSheetView,
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

  /**
   * Tracks whether there is a presented sheet for us to dismiss.
   *
   * Dismissing a modal that isn't presented is not a no-op: it sets the status to
   * DISMISSING and then calls forceClose on a sheet ref that is null, so nothing
   * ever advances the status to DISMISSED. The library skips the portal render
   * entirely while a modal is DISMISSING, which leaves the sheet permanently
   * unable to open — the tap fires, present() runs, and nothing renders.
   *
   * Two paths would otherwise do exactly that: the initial mount (visible=false,
   * never presented), and a sheet that closed itself via the backdrop or a
   * pan-down, where onDismiss has already run by the time `visible` flips.
   */
  const presentedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      shownRef.current = false;
      presentedRef.current = true;
      ref.current?.present();
    } else if (presentedRef.current) {
      presentedRef.current = false;
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
      // 'interactive', not 'extend': extend keeps the sheet at its content-height
      // detent and lets the keyboard cover it, while interactive subtracts the
      // keyboard height from that detent so the sheet rides above it.
      keyboardBehavior={keyboard ? 'interactive' : undefined}
      backdropComponent={renderBackdrop}
      handleComponent={grabber ? BottomSheetHandle : null}
      handleIndicatorStyle={styles.indicator}
      style={styles.sheet}
      backgroundStyle={styles.background}
      onChange={handleChange}
      onDismiss={() => {
        // Already closed itself, so there is nothing left for the effect to
        // dismiss — clearing this keeps it from re-entering DISMISSING.
        presentedRef.current = false;
        onCloseRef.current?.();
      }}
    >
      {/*
        Must be BottomSheetView, not a plain View: with enableDynamicSizing and no
        snapPoints, its onLayout is the only thing that reports the content height.
        Without it the sheet resolves to no detents at all, so present() has nowhere
        to snap — it stays invisible and never reaches an index, which also means
        onChange never fires and onShow never focuses the input.
      */}
      <BottomSheetView
        style={[styles.content, { paddingTop: title ? 0 : 16, paddingBottom: Math.max(16, insets.bottom) }]}
      >
        {!!title && <Text style={styles.title}>{title}</Text>}
        {children}
      </BottomSheetView>
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

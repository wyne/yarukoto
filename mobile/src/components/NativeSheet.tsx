import React, { useCallback, useEffect, useRef } from 'react';
import { Keyboard, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetFooterProps,
  BottomSheetHandle,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { makeStyles } from '../theme/styles';
import { useColors } from '../theme/ThemeContext';
import { fonts } from '../theme/typography';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after the native dismissal animation has completely finished. */
  onDismissed?: () => void;
  title?: string;
  /** Raise the sheet behind the keyboard instead of letting it cover the field. */
  keyboard?: boolean;
  /** Show the drag grabber; composers hide it so the input row sits at the top edge. */
  grabber?: boolean;
  /** Called once the sheet has been presented — the moment to focus an input. */
  onShow?: () => void;
  /**
   * Fixed detents instead of content-sized sizing. Sheets that fill most of the
   * screen (the task detail, say) hand their height here.
   */
  snapPoints?: (string | number)[];
  /** Extra styles for the sheet body — lets a sheet drop the default padding when its content draws its own. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Sheet chrome colour; the default is the app surface, not the screen behind. */
  background?: string;
  /** Optional bottom-sheet footer, useful for keyboard-adjacent floating controls. */
  footerComponent?: React.FC<BottomSheetFooterProps>;
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
export default function NativeSheet({
  visible,
  onClose,
  onDismissed,
  title,
  keyboard,
  grabber = true,
  onShow,
  snapPoints,
  contentStyle,
  background,
  footerComponent,
  children,
}: Props) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const ref = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;
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
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" opacity={colors.scrimOpacity} />
    ),
    []
  );

  /**
   * Driven from onAnimate rather than onChange, because onAnimate fires as the
   * animation starts where onChange only fires once it lands.
   *
   * Focusing at the start lets the keyboard begin rising while the sheet is still
   * travelling, so the two arrive together instead of sheet-then-keyboard. The
   * same applies leaving: starting the keyboard down as the sheet begins to close,
   * rather than waiting for onDismiss, keeps them in step on the way out too.
   */
  const handleAnimate = useCallback((_fromIndex: number, toIndex: number) => {
    if (toIndex >= 0 && !shownRef.current) {
      shownRef.current = true;
      onShowRef.current?.();
    }
    if (toIndex === -1) {
      Keyboard.dismiss();
    }
  }, []);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enableDynamicSizing={!snapPoints}
      enablePanDownToClose
      enableOverDrag={false}
      // 'interactive', not 'extend': extend keeps the sheet at its content-height
      // detent and lets the keyboard cover it, while interactive subtracts the
      // keyboard height from that detent so the sheet rides above it.
      keyboardBehavior={keyboard ? 'interactive' : undefined}
      // Interactive parks the sheet in a temporary raised position while the
      // keyboard is up; without restore it stays there once the keyboard goes,
      // stranding it mid-screen over a gap if the field is ever blurred without
      // the sheet closing — swiping the keyboard down, say.
      keyboardBlurBehavior={keyboard ? 'restore' : undefined}
      backdropComponent={renderBackdrop}
      footerComponent={footerComponent}
      handleComponent={grabber ? BottomSheetHandle : null}
      handleIndicatorStyle={styles.indicator}
      style={styles.sheet}
      backgroundStyle={[styles.background, background ? { backgroundColor: background } : null]}
      onAnimate={handleAnimate}
      onDismiss={() => {
        // Already closed itself, so there is nothing left for the effect to
        // dismiss — clearing this keeps it from re-entering DISMISSING.
        presentedRef.current = false;
        onCloseRef.current?.();
        onDismissedRef.current?.();
      }}
    >
      {/*
        Must be BottomSheetView, not a plain View: with enableDynamicSizing and no
        snapPoints, its onLayout is the only thing that reports the content height.
        Without it the sheet resolves to no detents at all, so present() has nowhere
        to snap — it stays invisible and never animates to an index, which also means
        onAnimate never fires and onShow never focuses the input.
      */}
      <BottomSheetView
        // Flattened, not an array: the library spreads an array style straight
        // into StyleSheet.compose, which takes exactly two arguments. Under
        // react-native-web that throws and takes the whole sheet down — three
        // entries is already one too many.
        style={StyleSheet.flatten([
          styles.content,
          contentStyle,
          {
            paddingTop: title ? 0 : 24,
            // A keyboard sheet rides above the keyboard, which is itself covering
            // the home indicator — so the bottom inset buys nothing there and just
            // leaves a gap under the content.
            paddingBottom: keyboard ? 12 : Math.max(16, insets.bottom),
          },
        ])}
      >
        {!!title && <Text style={styles.title}>{title}</Text>}
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((c) => ({
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
    paddingHorizontal: 16,
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.textPrimary,
    marginBottom: 12,
  },
}));

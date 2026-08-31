import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Keyboard, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetFooterProps,
  BottomSheetHandle,
  BottomSheetHandleProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { makeStyles } from '../theme/styles';
import { useColors } from '../theme/ThemeContext';
import SheetHeader from './SheetHeader';
import { useSheetBottomPadding } from './useSheetInsets';

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
  /**
   * Tallest a content-sized sheet may grow to, in points, and a detent it can be
   * dragged up to. Without it a sheet has exactly one detent — its content
   * height — so there is nowhere to drag and content past the bottom of the
   * screen is simply unreachable.
   *
   * Only meaningful alongside `scroll`: the cap is what makes a long list stop
   * growing, and the scrollable is what makes the part below the cap reachable.
   */
  maxHeight?: number;
  /**
   * Scroll the body instead of letting it size the sheet without limit.
   *
   * This moves the title row into the handle, which is the only place it can be
   * pinned: BottomSheetView claims the sheet's scrollable slot for itself, so a
   * scrollable nested inside one is left out of the pan gesture and never
   * scrolls. Everything in the handle is draggable, so the title resizes the
   * sheet along with the grabber.
   */
  scroll?: boolean;
  /** Extra styles for the sheet body — lets a sheet drop the default padding when its content draws its own. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Sheet chrome colour; the default is the app surface, not the screen behind. */
  background?: string;
  /** Optional bottom-sheet footer, useful for keyboard-adjacent floating controls. */
  footerComponent?: React.FC<BottomSheetFooterProps>;
  /** How this sheet should be presented when another modal sheet is already open. */
  stackBehavior?: 'push' | 'switch' | 'replace';
  /** Optional action at the trailing edge of the title row. */
  onDone?: () => void;
  doneLabel?: string;
  /** Glass actions used by draft/edit metadata sheets. */
  onCancel?: () => void;
  cancelLabel?: string;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
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
  maxHeight,
  scroll,
  contentStyle,
  background,
  footerComponent,
  stackBehavior,
  onDone,
  doneLabel = 'Done',
  onCancel,
  cancelLabel = 'Cancel',
  onConfirm,
  confirmLabel = 'Done',
  confirmDisabled = false,
  children,
}: Props) {
  const styles = useStyles();
  const colors = useColors();
  const bottomPadding = useSheetBottomPadding(keyboard);
  const ref = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;
  const shownRef = useRef(false);

  /**
   * The header's callbacks, held so `renderHandle` can reach the current ones
   * without listing them as dependencies — callers pass fresh arrow functions
   * every render, and a changed identity there remounts the whole handle.
   */
  const headerRef = useRef({ onCancel, onConfirm, onDone });
  headerRef.current = { onCancel, onConfirm, onDone };
  // Which buttons the header draws, as values rather than identities.
  const hasCancel = !!onCancel;
  const hasConfirm = !!onConfirm;
  const hasDone = !!onDone;

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

  useLayoutEffect(() => {
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

  /**
   * The title strip for a scrolling sheet, drawn in the handle so it stays put
   * while the body moves under it.
   *
   * Stable for the reason the backdrop is: a changed component identity remounts
   * what it draws. Only the values the header actually paints are dependencies;
   * the callbacks come off the ref above.
   */
  const renderHandle = useCallback(
    (props: BottomSheetHandleProps) => (
      <BottomSheetHandle
        {...props}
        style={styles.scrollHandle}
        indicatorStyle={grabber ? styles.indicator : styles.indicatorHidden}
      >
        {!!title && (
          <SheetHeader
            title={title}
            style={styles.scrollHeader}
            onCancel={hasCancel ? () => headerRef.current.onCancel?.() : undefined}
            cancelLabel={cancelLabel}
            onConfirm={hasConfirm ? () => headerRef.current.onConfirm?.() : undefined}
            confirmLabel={confirmLabel}
            confirmDisabled={confirmDisabled}
            onDone={hasDone ? () => headerRef.current.onDone?.() : undefined}
            doneLabel={doneLabel}
          />
        )}
      </BottomSheetHandle>
    ),
    [styles, grabber, title, hasCancel, cancelLabel, hasConfirm, confirmLabel, confirmDisabled, hasDone, doneLabel]
  );

  return (
    <BottomSheetModal
      ref={ref}
      // A content-sized sheet with a cap gets that cap as a second detent, so
      // there is somewhere to drag to. The two coincide once the content is
      // taller than the cap, and the library drops the duplicate.
      snapPoints={snapPoints ?? (maxHeight !== undefined ? [maxHeight] : undefined)}
      stackBehavior={stackBehavior}
      enableDynamicSizing={!snapPoints}
      maxDynamicContentSize={snapPoints ? undefined : maxHeight}
      enablePanDownToClose
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
      handleComponent={scroll ? renderHandle : grabber ? BottomSheetHandle : null}
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
      {scroll ? (
        /*
          Reports its own content size to dynamic sizing, so the sheet still opens
          at the height of what is in it — up to `maxHeight`, past which this
          scrolls instead of growing. The title is not in here; it is in the
          handle above, where it stays put.
        */
        <BottomSheetScrollView
          contentContainerStyle={StyleSheet.flatten([
            styles.content,
            { paddingBottom: bottomPadding },
            contentStyle,
          ])}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </BottomSheetScrollView>
      ) : (
        /*
          Must be BottomSheetView, not a plain View: with enableDynamicSizing and no
          snapPoints, its onLayout is the only thing that reports the content height.
          Without it the sheet resolves to no detents at all, so present() has nowhere
          to snap — it stays invisible and never animates to an index, which also means
          onAnimate never fires and onShow never focuses the input.
        */
        <BottomSheetView
          // Flattened, not an array: the library spreads an array style straight
          // into StyleSheet.compose, which takes exactly two arguments. Under
          // react-native-web that throws and takes the whole sheet down — three
          // entries is already one too many.
          style={StyleSheet.flatten([
            styles.content,
            {
              paddingTop: title ? 0 : 24,
              paddingBottom: bottomPadding,
            },
            // Last, so it can actually drop the padding above. A sheet that draws
            // its own chrome — the task detail with its own header — otherwise
            // gets the untitled sheet's 24pt reapplied under the grabber.
            contentStyle,
            // BottomSheetView is absolutely positioned with no bottom edge. A
            // fixed-detent sheet therefore needs an explicit height so flex
            // descendants receive a bounded viewport and can scroll immediately.
            snapPoints ? { height: '100%' } : null,
          ])}
        >
          {!!title && (
            <SheetHeader
              title={title}
              style={styles.header}
              onCancel={onCancel}
              cancelLabel={cancelLabel}
              onConfirm={onConfirm}
              confirmLabel={confirmLabel}
              confirmDisabled={confirmDisabled}
              onDone={onDone}
              doneLabel={doneLabel}
            />
          )}
          {children}
        </BottomSheetView>
      )}
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
  header: {
    marginBottom: 12,
  },
  /** The handle's own 10pt padding, widened to line the title up with the body. */
  scrollHandle: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  scrollHeader: {
    marginTop: 8,
  },
  indicatorHidden: {
    height: 0,
  },
}));

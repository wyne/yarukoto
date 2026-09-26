import React, { useEffect, useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import NativeSheet from './NativeSheet';
import Popover, { POPOVER_MIN_WIDTH, PopoverAnchor } from './Popover';
import Dialog from './Dialog';
import { DESKTOP_UI, MAC } from '../data/platform';
import { makeStyles } from '../theme/styles';
import SheetHeader from './SheetHeader';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after a native sheet has finished dismissing. */
  onDismissed?: () => void;
  title: string;
  /**
   * Where this was opened from. On the desktop it tethers the content to that
   * point as a popover; without one the desktop gets a centred dialog instead.
   * Pickers opened from a row or a button should always pass one.
   */
  anchor?: PopoverAnchor | null;
  popoverWidth?: number;
  /** Width of the desktop dialog, for content that wants more room than a picker. */
  dialogWidth?: number;
  /** Called once the surface has been presented — the moment to focus an input. */
  onShow?: () => void;
  /**
   * Returns to whatever opened this. Supplied when the picker was reached from
   * a menu, so its title doubles as the way back rather than stranding the user
   * with dismiss as the only exit.
   */
  onBack?: () => void;
  /**
   * Raise the sheet above the keyboard. For pickers with a text field in them.
   *
   * Ignored on the desktop, where there is no on-screen keyboard to be covered by.
   */
  keyboard?: boolean;
  /** How a native modal should join an existing sheet stack. */
  stackBehavior?: 'push' | 'switch' | 'replace';
  /**
   * Scroll the sheet body, capped at `maxHeight`. For a picker whose content
   * grows with the user's data and would otherwise run off the screen with no
   * way to reach the rest. Ignored on the desktop, where the dialog scrolls
   * itself and a popover is placed where it fits.
   */
  scroll?: boolean;
  maxHeight?: number;
  /** Optional trailing action in the native sheet title row. */
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
 * Whether this window takes desktop presentation: popovers and dialogs rather
 * than sheets from the bottom edge.
 *
 * The web goes by width as well as by device, because every browser counts as
 * desktop and a phone's browser is narrow — a sheet is still the right shape
 * there. A Mac window is a desktop window however narrow it is dragged.
 */
export function useDesktopPresentation(): boolean {
  const { width } = useWindowDimensions();
  return DESKTOP_UI && (MAC || width >= POPOVER_MIN_WIDTH);
}

/**
 * The app's one presentation for a titled, dismissible layer, so the Mac and the
 * web get their shape from one place.
 *
 * - Phone, or a phone-width browser: a pull-up sheet with a drag grabber.
 * - Desktop, opened from a control (`anchor`): a panel tethered to it.
 * - Desktop, with nothing to tether to: a dialog centred over the window.
 *
 * Anything that can be reached on the desktop goes through here rather than
 * `NativeSheet`, which is the phone branch only.
 */
export default function Sheet({
  visible,
  onClose,
  onDismissed,
  title,
  anchor,
  popoverWidth,
  dialogWidth,
  onShow,
  onBack,
  keyboard,
  stackBehavior,
  scroll,
  maxHeight,
  onDone,
  doneLabel,
  onCancel,
  cancelLabel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  children,
}: Props) {
  const styles = useStyles();
  const desktop = useDesktopPresentation();

  // The popover has no present animation to wait on, so the moment it is
  // visible is the moment it is shown. The dialog reports its own.
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;
  const popover = desktop && !!anchor;
  useEffect(() => {
    if (popover && visible) onShowRef.current?.();
  }, [popover, visible]);

  if (desktop) {
    const header = (
      <SheetHeader
        title={title}
        style={anchor ? styles.header : styles.dialogHeader}
        onBack={onBack}
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
        confirmDisabled={confirmDisabled}
        onDone={onDone}
        doneLabel={doneLabel}
      />
    );

    if (anchor) {
      return (
        <Popover visible={visible} onClose={onClose} anchor={anchor} align="start" width={popoverWidth}>
          {header}
          <View style={styles.body}>{children}</View>
        </Popover>
      );
    }

    return (
      <Dialog visible={visible} onClose={onClose} onShow={onShow} width={dialogWidth} header={header}>
        {children}
      </Dialog>
    );
  }

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      onShow={onShow}
      title={title}
      keyboard={keyboard}
      stackBehavior={stackBehavior}
      scroll={scroll}
      maxHeight={maxHeight}
      onDone={onDone}
      doneLabel={doneLabel}
      onCancel={onCancel}
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
      confirmLabel={confirmLabel}
      confirmDisabled={confirmDisabled}
    >
      {children}
    </NativeSheet>
  );
}

const useStyles = makeStyles(() => ({
  header: {
    marginBottom: 10,
  },
  dialogHeader: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  /** The sheet's own padding comes from NativeSheet; the popover card has its own. */
  body: {
    marginBottom: 8,
  },
}));

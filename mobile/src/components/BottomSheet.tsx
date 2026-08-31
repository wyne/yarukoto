import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import NativeSheet from './NativeSheet';
import Popover, { POPOVER_MIN_WIDTH, PopoverAnchor } from './Popover';
import { WEB_ENTRY } from '../data/platform';
import { makeStyles } from '../theme/styles';
import SheetHeader from './SheetHeader';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after a native sheet has finished dismissing. */
  onDismissed?: () => void;
  title: string;
  /**
   * Where this was opened from. Supplying it lets a roomy web window show the
   * same content tethered to that point instead of as a sheet — the right shape
   * when the picker was reached from a context menu rather than a toolbar.
   */
  anchor?: PopoverAnchor | null;
  popoverWidth?: number;
  /**
   * Returns to whatever opened this. Supplied when the picker was reached from
   * a menu, so its title doubles as the way back rather than stranding the user
   * with dismiss as the only exit.
   */
  onBack?: () => void;
  /**
   * Raise the sheet above the keyboard. For pickers with a text field in them.
   *
   * Ignored by the popover branch, which is only reached on a wide web window
   * where there is no keyboard to be covered by.
   */
  keyboard?: boolean;
  /** How a native modal should join an existing sheet stack. */
  stackBehavior?: 'push' | 'switch' | 'replace';
  /**
   * Scroll the sheet body, capped at `maxHeight`. For a picker whose content
   * grows with the user's data and would otherwise run off the screen with no
   * way to reach the rest. Ignored by the popover branch, which scrolls itself.
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
 * The app's standard picker: a titled pull-up with a drag grabber, or a tethered
 * panel when opened from a point on a wide web window.
 */
export default function BottomSheet({
  visible,
  onClose,
  onDismissed,
  title,
  anchor,
  popoverWidth,
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
  const { width } = useWindowDimensions();

  if (anchor && WEB_ENTRY && width >= POPOVER_MIN_WIDTH) {
    return (
      <Popover visible={visible} onClose={onClose} anchor={anchor} align="start" width={popoverWidth}>
        <SheetHeader
          title={title}
          style={styles.header}
          onBack={onBack}
          onCancel={onCancel}
          cancelLabel={cancelLabel}
          onConfirm={onConfirm}
          confirmLabel={confirmLabel}
          confirmDisabled={confirmDisabled}
          onDone={onDone}
          doneLabel={doneLabel}
        />
        <View style={styles.body}>{children}</View>
      </Popover>
    );
  }

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
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
  /** The sheet's own padding comes from NativeSheet; the popover card has its own. */
  body: {
    marginBottom: 8,
  },
}));

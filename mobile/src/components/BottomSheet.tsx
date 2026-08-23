import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import NativeSheet from './NativeSheet';
import Popover, { POPOVER_MIN_WIDTH, PopoverAnchor } from './Popover';
import { WEB_ENTRY } from '../data/platform';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { hoverable } from '../theme/hover';
import { IconChevronLeft } from '../icons/Icons';

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
  children,
}: Props) {
  const { width } = useWindowDimensions();

  if (anchor && WEB_ENTRY && width >= POPOVER_MIN_WIDTH) {
    return (
      <Popover visible={visible} onClose={onClose} anchor={anchor} align="start" width={popoverWidth}>
        {onBack ? (
          <Pressable onPress={onBack} style={hoverable(styles.backRow, styles.backRowHovered)}>
            <IconChevronLeft size={12} color={colors.textTertiary} />
            <Text style={styles.title}>{title}</Text>
          </Pressable>
        ) : (
          <Text style={[styles.title, styles.titleAlone]}>{title}</Text>
        )}
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
    >
      {children}
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  titleAlone: {
    marginBottom: 10,
  },
  /** The whole header is the target, so the chevron isn't a 12px hit area. */
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginLeft: -5,
    marginBottom: 8,
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderRadius: 6,
  },
  backRowHovered: {
    backgroundColor: colors.hoverBg,
  },
  /** The sheet's own padding comes from NativeSheet; the popover card has its own. */
  body: {
    marginBottom: 8,
  },
});

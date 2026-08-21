import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import NativeSheet from './NativeSheet';
import Popover, { POPOVER_MIN_WIDTH, PopoverAnchor } from './Popover';
import { WEB_ENTRY } from '../data/platform';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  /**
   * Where this was opened from. Supplying it lets a roomy web window show the
   * same content tethered to that point instead of as a sheet — the right shape
   * when the picker was reached from a context menu rather than a toolbar.
   */
  anchor?: PopoverAnchor | null;
  popoverWidth?: number;
  children: React.ReactNode;
}

/**
 * The app's standard picker: a titled pull-up with a drag grabber, or a tethered
 * panel when opened from a point on a wide web window.
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  anchor,
  popoverWidth,
  children,
}: Props) {
  const { width } = useWindowDimensions();

  if (anchor && WEB_ENTRY && width >= POPOVER_MIN_WIDTH) {
    return (
      <Popover visible={visible} onClose={onClose} anchor={anchor} align="start" width={popoverWidth}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.body}>{children}</View>
      </Popover>
    );
  }

  return (
    <NativeSheet visible={visible} onClose={onClose} title={title}>
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
    marginBottom: 10,
  },
  /** The sheet's own padding comes from NativeSheet; the popover card has its own. */
  body: {
    marginBottom: 8,
  },
});

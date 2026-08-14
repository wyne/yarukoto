import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import SlideUpModal from './SlideUpModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function BottomSheet({ visible, onClose, title, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      sheetStyle={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom) }]}
    >
      <View style={styles.grabber} />
      <Text style={styles.title}>{title}</Text>
      {children}
    </SlideUpModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
});

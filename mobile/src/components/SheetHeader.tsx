import React from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { makeStyles } from '../theme/styles';
import { useAccent, useColors } from '../theme/ThemeContext';
import { fonts } from '../theme/typography';
import { selectionCheckColor } from '../theme/colors';
import { hoverable } from '../theme/hover';
import GlassIconButton from './GlassIconButton';
import { IconCheckBig, IconChevronLeft, IconPlus } from '../icons/Icons';

interface Props {
  title: string;
  style?: StyleProp<ViewStyle>;
  onBack?: () => void;
  backLabel?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onDone?: () => void;
  doneLabel?: string;
}

export default function SheetHeader({
  title,
  style,
  onBack,
  backLabel = 'Back',
  onCancel,
  cancelLabel = 'Cancel',
  onConfirm,
  confirmLabel = 'Done',
  confirmDisabled = false,
  onDone,
  doneLabel = 'Done',
}: Props) {
  const colors = useColors();
  const accent = useAccent();
  const accentText = selectionCheckColor(accent);
  const styles = useStyles();

  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerSide}>
        {!!onBack ? (
          <GlassIconButton onPress={onBack} label={backLabel}>
            <IconChevronLeft size={18} color={colors.textPrimary} strokeWidth={2} />
          </GlassIconButton>
        ) : !!onCancel ? (
          <GlassIconButton onPress={onCancel} label={cancelLabel}>
            <View style={styles.cancelIcon}>
              <IconPlus size={18} color={colors.textPrimary} strokeWidth={2} />
            </View>
          </GlassIconButton>
        ) : null}
      </View>
      <Text pointerEvents="none" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={[styles.headerSide, styles.headerSideEnd]}>
        {!!onConfirm ? (
          <GlassIconButton
            onPress={onConfirm}
            label={confirmLabel}
            tintColor={confirmDisabled ? undefined : accent}
            disabled={confirmDisabled}
          >
            <IconCheckBig
              size={18}
              color={confirmDisabled ? colors.textFaint : accentText}
              strokeWidth={2.4}
            />
          </GlassIconButton>
        ) : !!onDone ? (
          <Pressable
            onPress={onDone}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={doneLabel}
            style={hoverable(styles.doneButton, styles.doneButtonHovered)}
          >
            <Text style={[styles.doneText, { color: accent }]}>{doneLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: {
    minHeight: 44,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSide: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  headerSideEnd: {
    left: undefined,
    right: 0,
    alignItems: 'flex-end',
  },
  title: {
    position: 'absolute',
    left: 56,
    right: 56,
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.textPrimary,
    textAlign: 'center',
  },
  cancelIcon: {
    transform: [{ rotate: '45deg' }],
  },
  doneButton: {
    marginRight: -5,
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderRadius: 6,
  },
  doneButtonHovered: {
    backgroundColor: c.hoverBg,
  },
  doneText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
  },
}));

import React from 'react';
import { useColors } from '../../theme/ThemeContext';
import { Pressable, Text, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import { priorityColor } from '../../theme/colors';
import { makeStyles } from '../../theme/styles';
import { useHoverBg } from '../../theme/hover';
import { fonts } from '../../theme/typography';
import { Priority } from '../../data/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to BottomSheet: a point makes this a popover on wide web. */
  anchor?: PopoverAnchor | null;
  onApply: (priority: Priority) => void;
}

const OPTIONS: { value: Priority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'No priority' },
];

export default function PriorityPickerSheet({ visible, onClose, anchor, onApply }: Props) {
  const hoverBg = useHoverBg();
  const colors = useColors();
  const styles = useStyles();
  const choose = (priority: Priority) => {
    onApply(priority);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Priority" anchor={anchor} popoverWidth={240}>
      {OPTIONS.map((o) => (
        <Pressable key={o.value} style={hoverBg(styles.row)} onPress={() => choose(o.value)}>
          <View
            style={[
              styles.dot,
              { borderColor: o.value === 'none' ? colors.ringNone : priorityColor(o.value, colors) },
            ]}
          />
          <Text style={styles.rowText}>{o.label}</Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 11,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  rowText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
  },
}));

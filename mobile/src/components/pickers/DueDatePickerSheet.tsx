import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import { useColors } from '../../theme/ThemeContext';
import { fonts } from '../../theme/typography';
import DueDateTimeControls from './DueDateTimeControls';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to BottomSheet: a point makes this a popover on wide web. */
  anchor?: PopoverAnchor | null;
  /** Forwarded to BottomSheet: returns to the menu that opened this. */
  onBack?: () => void;
  initialDate?: string;
  initialTime?: string;
  onApply: (dueDate: string | undefined, dueTime: string | undefined) => void;
}

export default function DueDatePickerSheet({ visible, onClose, initialDate, initialTime, onApply, anchor, onBack }: Props) {
  const colors = useColors();
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    if (visible) {
      setDate(initialDate);
      setTime(initialTime);
    }
  }, [visible, initialDate, initialTime]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Due date"
      anchor={anchor}
      popoverWidth={330}
      onBack={onBack}
    >
      <DueDateTimeControls date={date} time={time} onChange={(nextDate, nextTime) => {
        setDate(nextDate);
        setTime(nextTime);
      }} />
      <Pressable
        style={[styles.applyBtn, { backgroundColor: colors.inverseSurface }]}
        onPress={() => {
          onApply(date, date ? time : undefined);
          onClose();
        }}
      >
        <Text style={[styles.applyText, { color: colors.inverseText }]}>Apply</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  applyBtn: {
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: '#fff',
  },
});

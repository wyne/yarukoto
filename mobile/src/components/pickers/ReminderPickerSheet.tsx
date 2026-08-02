import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { ReminderOption } from '../../data/types';
import { reminderLabel } from '../../data/dateUtils';

interface Props {
  visible: boolean;
  onClose: () => void;
  value: ReminderOption;
  onApply: (value: ReminderOption) => void;
}

const OPTIONS: ReminderOption[] = ['none', 'at_time', '30m', '1h', '1d'];

export default function ReminderPickerSheet({ visible, onClose, value, onApply }: Props) {
  const accent = useAccent();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Reminder">
      <View>
        {OPTIONS.map((opt) => {
          const active = opt === value;
          return (
            <Pressable
              key={opt}
              style={styles.row}
              onPress={() => {
                onApply(opt);
                onClose();
              }}
            >
              <Text style={[styles.rowText, active && { color: accent, fontFamily: fonts.sansSemiBold }]}>
                {reminderLabel(opt)}
              </Text>
              {active && <View style={[styles.dot, { backgroundColor: accent }]} />}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

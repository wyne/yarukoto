import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useScheme } from '../../theme/ThemeContext';
import { fromISODate, toISODate } from '../../data/dateUtils';
import SheetHeader from '../SheetHeader';
import DueDateTimeControls from './DueDateTimeControls';
import type { ActiveDateTimePickerRequest } from '../../navigation/DateTimePickerContext';
import { MAC } from '../../data/platform';
import MacTimeMenus from './MacTimeMenus';

interface Props {
  request: ActiveDateTimePickerRequest;
  onCancel: () => void;
  onApply: (date: string | undefined, time: string | undefined) => void;
}

function valueForPicker(date?: string, time?: string): Date {
  const value = date ? fromISODate(date) : new Date();
  const [hours, minutes] = (time ?? '09:00').split(':').map(Number);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function timeFromPicker(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

/**
 * The custom date or time picker's contents: title row, the platform's picker,
 * and a way to clear the time.
 *
 * Shared by the phone's form-sheet screen and the desktop's popover, so each
 * platform's picker choices (no wheels on the Mac, the app's own controls on the
 * web) live in one place whichever shape it is presented in.
 */
export default function DateTimePickerPanel({ request, onCancel, onApply }: Props) {
  const styles = useStyles();
  const accent = useAccent();
  const scheme = useScheme();
  const [draftDate, setDraftDate] = useState<string | undefined>(() => request.date ?? toISODate(new Date()));
  const [draftTime, setDraftTime] = useState(() =>
    request.mode === 'time' ? request.time ?? '09:00' : request.time
  );

  useEffect(() => {
    setDraftDate(request.date ?? toISODate(new Date()));
    setDraftTime(request.mode === 'time' ? request.time ?? '09:00' : request.time);
  }, [request]);

  const apply = () => onApply(draftDate, draftDate ? draftTime : undefined);

  return (
    <>
      <SheetHeader
        title={request.mode === 'date' ? 'Pick date' : 'Pick time'}
        onCancel={onCancel}
        onConfirm={apply}
      />

      {MAC && request.mode === 'time' ? (
        // The Mac has no wheels: UIKit throws the moment one reaches a window
        // there, and the compact field that stands in for one takes no input.
        <View style={styles.macTime}>
          <MacTimeMenus
            value={draftTime ?? '09:00'}
            onChange={(next) => {
              setDraftDate((current) => current ?? toISODate(new Date()));
              setDraftTime(next);
            }}
          />
        </View>
      ) : Platform.OS === 'ios' ? (
        <DateTimePicker
          value={valueForPicker(draftDate, draftTime)}
          mode={request.mode}
          display={request.mode === 'date' ? 'inline' : 'spinner'}
          accentColor={accent}
          themeVariant={scheme}
          onValueChange={(_, selected) => {
            if (request.mode === 'date') setDraftDate(toISODate(selected));
            else {
              setDraftDate((current) => current ?? toISODate(new Date()));
              setDraftTime(timeFromPicker(selected));
            }
          }}
          style={request.mode === 'date' ? styles.datePicker : styles.timePicker}
        />
      ) : (
        <DueDateTimeControls
          date={draftDate}
          time={draftTime}
          initialMode={request.mode}
          allowModeSwitch={false}
          onChange={(nextDate, nextTime) => {
            setDraftDate(nextDate);
            setDraftTime(nextTime);
          }}
          clearDateLabel={request.clearDateLabel}
        />
      )}

      {/* DueDateTimeControls draws its own. */}
      {Platform.OS === 'ios' && request.mode === 'time' && !!draftTime && (
        <Pressable
          accessibilityRole="button"
          style={styles.clearButton}
          onPress={() => onApply(draftDate, undefined)}
        >
          <Text style={styles.clearText}>Clear time</Text>
        </Pressable>
      )}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  datePicker: {
    width: '100%',
    height: 390,
  },
  timePicker: {
    width: '100%',
    height: 240,
    marginTop: 20,
  },
  macTime: {
    marginTop: 24,
  },
  clearButton: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  clearText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: c.priorityHigh,
  },
}));

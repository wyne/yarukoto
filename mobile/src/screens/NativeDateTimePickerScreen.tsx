import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { selectionCheckColor } from '../theme/colors';
import { useAccent, useColors, useScheme } from '../theme/ThemeContext';
import { fromISODate, toISODate } from '../data/dateUtils';
import { IconCheckBig, IconPlus } from '../icons/Icons';
import GlassIconButton from '../components/GlassIconButton';
import DueDateTimeControls from '../components/pickers/DueDateTimeControls';
import { useDateTimePickerRequest } from '../navigation/DateTimePickerContext';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DateTimePicker'>;

function valueForPicker(date?: string, time?: string): Date {
  const value = date ? fromISODate(date) : new Date();
  const [hours, minutes] = (time ?? '09:00').split(':').map(Number);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function timeFromPicker(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export default function NativeDateTimePickerScreen({ navigation, route }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const accentText = selectionCheckColor(accent);
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const { active, complete, cancel } = useDateTimePickerRequest();
  const request = active?.id === route.params.requestId ? active : null;
  const [draftDate, setDraftDate] = useState(() =>
    request ? request.date ?? toISODate(new Date()) : undefined
  );
  const [draftTime, setDraftTime] = useState(() =>
    request?.mode === 'time' ? request.time ?? '09:00' : request?.time
  );

  useEffect(() => {
    if (!request) return;
    setDraftDate(request.date ?? toISODate(new Date()));
    setDraftTime(request.mode === 'time' ? request.time ?? '09:00' : request.time);
  }, [request]);

  useEffect(() => () => cancel(), [cancel]);

  if (!request) return <View style={styles.screen} />;

  const close = () => {
    cancel();
    navigation.goBack();
  };
  const apply = () => {
    complete(draftDate, draftDate ? draftTime : undefined);
    navigation.goBack();
  };

  return (
    <View style={[styles.screen, { paddingTop: Math.max(8, insets.top) }]}>
      <View style={styles.header}>
        <GlassIconButton onPress={close} label="Cancel">
          <View style={styles.closeIcon}>
            <IconPlus size={18} color={colors.textPrimary} strokeWidth={2} />
          </View>
        </GlassIconButton>
        <Text style={styles.title}>{request.mode === 'date' ? 'Pick date' : 'Pick time'}</Text>
        <GlassIconButton onPress={apply} label="Done" tintColor={accent}>
          <IconCheckBig size={18} color={accentText} strokeWidth={2.4} />
        </GlassIconButton>
      </View>

      {Platform.OS === 'ios' ? (
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

      {request.mode === 'time' && !!draftTime && (
        <Pressable
          accessibilityRole="button"
          style={styles.clearButton}
          onPress={() => {
            complete(draftDate, undefined);
            navigation.goBack();
          }}
        >
          <Text style={styles.clearText}>Clear time</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: c.surface,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.textPrimary,
  },
  closeIcon: {
    transform: [{ rotate: '45deg' }],
  },
  datePicker: {
    width: '100%',
    height: 390,
  },
  timePicker: {
    width: '100%',
    height: 240,
    marginTop: 20,
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

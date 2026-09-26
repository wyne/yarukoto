import React, { useEffect } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/styles';
import { useSheetBottomPadding } from '../components/useSheetInsets';
import DateTimePickerPanel from '../components/pickers/DateTimePickerPanel';
import { useDateTimePickerRequest } from '../navigation/DateTimePickerContext';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DateTimePicker'>;

/**
 * The custom date or time picker as a phone form sheet. The desktop shows the
 * same panel as a popover instead; see `DateTimePickerProvider`.
 */
export default function NativeDateTimePickerScreen({ navigation, route }: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const bottomPadding = useSheetBottomPadding();
  const { active, complete, cancel } = useDateTimePickerRequest();
  const request = active?.id === route.params.requestId ? active : null;

  useEffect(() => () => cancel(), [cancel]);

  if (!request) return <View style={styles.screen} />;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(8, insets.top), paddingBottom: bottomPadding }]}>
      <DateTimePickerPanel
        request={request}
        onCancel={() => {
          cancel();
          navigation.goBack();
        }}
        onApply={(date, time) => {
          complete(date, time);
          navigation.goBack();
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: c.surface,
  },
}));

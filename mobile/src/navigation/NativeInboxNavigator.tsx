import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InboxParams } from './types';
import InboxScreen from '../screens/InboxScreen';
import TodayScreen from '../screens/TodayScreen';
import ActivityScreen from '../screens/ActivityScreen';
import TrashScreen from '../screens/TrashScreen';

export type NativeInboxStackParamList = {
  InboxHome: InboxParams | undefined;
  Today: undefined;
  Activity: undefined;
  Trash: undefined;
};

const Stack = createNativeStackNavigator<NativeInboxStackParamList>();

/** Secondary drawer destinations live behind Inbox without becoming native tab items. */
export default function NativeInboxNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InboxHome" component={InboxScreen} />
      <Stack.Screen name="Today" component={TodayScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
      <Stack.Screen name="Trash" component={TrashScreen} />
    </Stack.Navigator>
  );
}

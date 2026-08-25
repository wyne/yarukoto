import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InboxParams } from './types';
import AllScreen from '../screens/AllScreen';
import InboxScreen from '../screens/InboxScreen';
import TodayScreen from '../screens/TodayScreen';
import ActivityScreen from '../screens/ActivityScreen';
import TrashScreen from '../screens/TrashScreen';

export type NativeListStackParamList = {
  All: undefined;
  FilteredList: InboxParams;
  Today: undefined;
  Activity: undefined;
  Trash: undefined;
};

const Stack = createNativeStackNavigator<NativeListStackParamList>();

/** Stateful list tab: remembers the latest drawer destination while other tabs are open. */
export default function NativeListNavigator() {
  return (
    <Stack.Navigator initialRouteName="All" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="All" component={AllScreen} />
      <Stack.Screen name="FilteredList" component={InboxScreen} />
      <Stack.Screen name="Today" component={TodayScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
      <Stack.Screen name="Trash" component={TrashScreen} />
    </Stack.Navigator>
  );
}

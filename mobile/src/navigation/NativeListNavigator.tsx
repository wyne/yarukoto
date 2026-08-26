import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NativeTaskViewParams } from './types';
import { useInboxFilter } from '../screens/InboxScreen';
import TaskListScreen from '../screens/TaskListScreen';
import ActivityScreen from '../screens/ActivityScreen';
import TrashScreen from '../screens/TrashScreen';

export type NativeListStackParamList = {
  Tasks: NativeTaskViewParams | undefined;
  Activity: undefined;
  Trash: undefined;
};

const Stack = createNativeStackNavigator<NativeListStackParamList>();

function NativeTasksScreen({ route }: { route: { params?: NativeTaskViewParams } }) {
  const filter = useInboxFilter(route.params);
  const mode = route.params?.view === 'today' ? 'today' : filter ? 'inbox' : 'all';

  return <TaskListScreen mode={mode} filter={filter} />;
}

/** Stateful list tab: remembers the latest drawer destination while other tabs are open. */
export default function NativeListNavigator() {
  return (
    <Stack.Navigator initialRouteName="Tasks" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tasks" component={NativeTasksScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
      <Stack.Screen name="Trash" component={TrashScreen} />
    </Stack.Navigator>
  );
}

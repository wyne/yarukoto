import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTasks } from '../data/TaskContext';
import { RootStackParamList } from './types';
import FirstRunScreen from '../screens/FirstRunScreen';
import MainTabs from './MainTabs';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { state } = useTasks();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!state.connected ? (
        <Stack.Screen name="FirstRun" component={FirstRunScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}

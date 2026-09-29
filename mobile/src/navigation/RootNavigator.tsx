import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTasks } from '../data/TaskContext';
import { RootStackParamList } from './types';
import FirstRunScreen from '../screens/FirstRunScreen';
import MainTabs from './MainTabs';
import NativeDateTimePickerScreen from '../screens/NativeDateTimePickerScreen';
import { useColors } from '../theme/ThemeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const colors = useColors();
  const { state, signedOut } = useTasks();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Signed out is the sign-in screen again, pointed at the same server,
          with everything on this device kept until someone signs back in. */}
      {state.mode === 'none' || signedOut ? (
        <Stack.Screen name="FirstRun" component={FirstRunScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="DateTimePicker"
            component={NativeDateTimePickerScreen}
            options={({ route }) => ({
              presentation: 'formSheet',
              animation: 'default',
              sheetAllowedDetents: route.params.mode === 'date' ? [0.6, 0.9] : [0.42, 0.68],
              sheetInitialDetentIndex: 0,
              sheetGrabberVisible: true,
              sheetExpandsWhenScrolledToEdge: false,
              contentStyle: { backgroundColor: colors.surface },
            })}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

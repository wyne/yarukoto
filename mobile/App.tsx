import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { fontMap } from './src/theme/typography';
import { colors } from './src/theme/colors';
import { ThemeProvider } from './src/theme/ThemeContext';
import { TaskProvider } from './src/data/TaskContext';
import { initStorage } from './src/data/storage';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  const [fontsLoaded] = useFonts(fontMap);
  const [storageReady, setStorageReady] = useState(false);

  // TaskProvider reads the persisted mode and token synchronously as it
  // initialises, so this has to land before anything mounts — otherwise a
  // returning user gets a flash of the connect screen, or worse, stays on it.
  useEffect(() => {
    initStorage().then(() => setStorageReady(true));
  }, []);

  if (!fontsLoaded || !storageReady) {
    return <View style={styles.loading} />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <TaskProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </TaskProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
});

import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { LinkingOptions, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import { fontMap } from './src/theme/typography';
import { colors } from './src/theme/colors';
import { ThemeProvider } from './src/theme/ThemeContext';
import { TaskProvider } from './src/data/TaskContext';
import { initStorage } from './src/data/storage';
import RootNavigator from './src/navigation/RootNavigator';
import { RootStackParamList } from './src/navigation/types';
import { DateTimePickerProvider, navigationRef } from './src/navigation/DateTimePickerContext';

/**
 * Web URLs. Without this the address bar never moves off `/`, so a reload — or a
 * link someone sent you — always lands on All rather than the view you were
 * looking at, and Back leaves the app instead of retracing it.
 *
 * Two things about the paths:
 *
 * `config.path` is the deployment prefix. The self-hosted server serves from the
 * domain root, but a Pages project site lives under /<repo>/, and React Navigation
 * reads `location.pathname` raw — an unprefixed config would match nothing there.
 * `EXPO_BASE_URL` is the same value app.config.js bakes into the asset URLs, inlined
 * into the bundle by babel-preset-expo, so both sides agree by construction.
 *
 * Every route is a *single* path segment on purpose. public/index.html links its
 * icons and manifest relatively so they resolve under either deployment, and those
 * are resolved against the current URL: a second segment would send them looking
 * one directory too deep. That's why a filtered Inbox carries its list or tag as a
 * query param rather than as `/list/<id>`.
 */
const baseUrl = process.env.EXPO_BASE_URL?.replace(/\/+$/, '');

const linking: LinkingOptions<RootStackParamList> = {
  // Web-only: this exists to keep the address bar in step with the app, and no
  // native deep-link scheme is registered for the prefixes to strip.
  enabled: Platform.OS === 'web',
  prefixes: [],
  config: {
    path: baseUrl || undefined,
    screens: {
      FirstRun: 'connect',
      Main: {
        screens: {
          AllTab: '',
          InboxTab: 'inbox',
          TodayTab: 'today',
          CalendarTab: 'calendar',
          ActivityTab: 'activity',
          BrowseTab: 'browse',
          TrashTab: 'trash',
        },
      },
    },
  },
};

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
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider>
          <TaskProvider>
            <DateTimePickerProvider>
              <BottomSheetModalProvider>
                <NavigationContainer ref={navigationRef} linking={linking}>
                  <StatusBar style="dark" />
                  <RootNavigator />
                </NavigationContainer>
              </BottomSheetModalProvider>
            </DateTimePickerProvider>
          </TaskProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
});

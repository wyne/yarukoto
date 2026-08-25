import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, LinkingOptions, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import { fontMap } from './src/theme/typography';
import { lightPalette } from './src/theme/colors';
import { ThemeProvider, useColors, useScheme } from './src/theme/ThemeContext';
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
 * one directory too deep. That's why a filtered Inbox carries its list, folder or
 * tag as a query param rather than as `/list/<id>`.
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

/**
 * Everything that has to know the colour scheme, below the provider that knows it.
 *
 * `StatusBar` used to be pinned to dark glyphs and the navigator was given no
 * theme at all, so React Navigation painted its own light grey wherever a
 * screen did not paint first.
 */
function Chrome() {
  const scheme = useScheme();
  const colors = useColors();
  (TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, keyboardAppearance: scheme };
  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: colors.screenBg,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
    },
  };
  return (
    <NavigationContainer ref={navigationRef} linking={linking} theme={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

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
                <Chrome />
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
    // The frame before fonts and storage are ready, so before there is a
    // provider to ask. Light until the scheme can be read from the primed cache
    // — see the stage that turns dark mode on.
    backgroundColor: lightPalette.screenBg,
  },
});

// Font family names as registered by useFonts() in App.tsx.
export const fonts = {
  sansRegular: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemiBold: 'IBMPlexSans_600SemiBold',
  sansBold: 'IBMPlexSans_700Bold',
  monoRegular: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
} as const;

export const fontMap = {
  IBMPlexSans_400Regular: require('@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf'),
  IBMPlexSans_500Medium: require('@expo-google-fonts/ibm-plex-sans/500Medium/IBMPlexSans_500Medium.ttf'),
  IBMPlexSans_600SemiBold: require('@expo-google-fonts/ibm-plex-sans/600SemiBold/IBMPlexSans_600SemiBold.ttf'),
  IBMPlexSans_700Bold: require('@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf'),
  IBMPlexMono_400Regular: require('@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf'),
  IBMPlexMono_500Medium: require('@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf'),
  IBMPlexMono_600SemiBold: require('@expo-google-fonts/ibm-plex-mono/600SemiBold/IBMPlexMono_600SemiBold.ttf'),
};

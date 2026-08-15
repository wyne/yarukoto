import { Platform } from 'react-native';

/**
 * Task entry is split by platform, not by screen width: web types into a
 * pinned field; native taps a floating button that opens the composer sheet.
 * The difference that matters is having a keyboard already in front of you,
 * not how many pixels are — a wide phone-in-landscape shouldn't get the web
 * treatment, and a narrow browser window shouldn't get the FAB.
 */
export const WEB_ENTRY = Platform.OS === 'web';

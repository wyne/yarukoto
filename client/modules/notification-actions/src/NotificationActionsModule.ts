import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * The native half only exists on iOS. Android reaches the same place through a
 * headless JS task — which boots the real bundle, and so gets the real sync
 * client rather than a second implementation of it in Kotlin.
 *
 * Optional rather than required so a JS-only context — web, or a build made
 * before this module existed — degrades to no-ops instead of throwing at import.
 */
interface NativeNotificationActions {
  setCredentials: (serverUrl: string | null, token: string | null) => void;
  drainPendingActions: () => unknown[];
}

const native =
  Platform.OS === 'ios' ? requireOptionalNativeModule<NativeNotificationActions>('NotificationActions') : null;

export const hasNativeNotificationActions = native != null;

/** Mirrors the server connection where the native handler can read it. */
export function setNativeCredentials(serverUrl: string | null, token: string | null): void {
  native?.setCredentials(serverUrl, token);
}

/** Returns everything done while JS was not running, clearing it as it goes. */
export function drainNativePendingActions(): unknown[] {
  return native?.drainPendingActions() ?? [];
}

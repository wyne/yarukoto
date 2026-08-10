import { Alert, Platform } from 'react-native';

/**
 * Alert.alert is a no-op on react-native-web, which would leave destructive
 * actions silently dead in the browser. Fall back to the native dialog there.
 */
export function confirmDestructive(title: string, message: string, onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

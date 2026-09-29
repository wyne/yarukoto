import { Alert } from 'react-native';
import { ApiError, useTasks } from '../data/TaskContext';
import { confirmAsync } from '../data/confirm';
import { claimJoinLink, useJoinLink, useSignIn } from './joinLinks';

/**
 * A sign-in QR scanned by the Camera app while this device is already signed
 * in. It would replace the sign-in this device has, so it asks first rather
 * than switching, or silently doing nothing.
 */
export default function JoinLinkHandler() {
  const { state } = useTasks();
  const signIn = useSignIn();

  useJoinLink(async (link) => {
    const here = state.mode === 'server' && state.serverUrl === link.serverUrl;
    const ok = await confirmAsync(
      'Sign in with this QR?',
      here
        ? "This replaces this device's current sign-in."
        : `This signs in to ${link.serverUrl} instead of the server this device uses now.`,
      'Sign in'
    );
    if (!ok) return;
    try {
      await signIn(link.serverUrl, await claimJoinLink(link));
    } catch (err) {
      Alert.alert('Could not sign in', err instanceof ApiError ? err.message : 'Something went wrong signing in.');
    }
  });

  return null;
}

import { useCallback, useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import { ApiError, useTasks } from '../data/TaskContext';
import { JoinLink, createPairingApi, parseJoinLink } from '../data/api';
import { confirmAsync } from '../data/confirm';

/**
 * Join links already acted on. The launch URL is replayed every time a
 * listener mounts, so without this, disconnecting would sign straight back in —
 * or, the link having been used, show its failure again.
 */
const handledJoinLinks = new Set<string>();

/**
 * A `yarukoto://join` link opened from outside the app: a signed-in device
 * showed a QR and this phone's Camera app scanned it. Native only; the web has
 * no link to be opened with.
 */
export function useJoinLink(onJoin: (link: JoinLink) => void): void {
  const onJoinRef = useRef(onJoin);
  onJoinRef.current = onJoin;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (url: string | null) => {
      if (!url || handledJoinLinks.has(url)) return;
      const link = parseJoinLink(url);
      if (!link) return;
      handledJoinLinks.add(url);
      onJoinRef.current(link);
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => open(url));
    return () => subscription.remove();
  }, []);
}

/** Claims the sign-in a join QR carries, returning its token. */
export async function claimJoinLink(link: JoinLink): Promise<string> {
  try {
    const result = await createPairingApi(link.serverUrl).poll(link.pairing);
    if (result.status !== 'approved') throw new ApiError(0, 'That QR has not been approved yet.');
    return result.token;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new ApiError(404, 'That QR was already used or has expired. Show a new one on the signed-in device.');
    }
    throw err;
  }
}

/**
 * Signs in with a token, from any state. Signed out, or not connected at all,
 * it just connects. Already connected, it goes through `signInAgain`, and asks
 * before throwing away edits that never reached the server. Resolves false
 * when the person declines.
 */
export function useSignIn(): (serverUrl: string, token: string) => Promise<boolean> {
  const { state, connect, signInAgain } = useTasks();
  const connected = state.mode === 'server';
  return useCallback(
    async (serverUrl, token) => {
      if (!connected) {
        await connect(serverUrl, token);
        return true;
      }
      const first = await signInAgain(serverUrl, token);
      if (first.status === 'done') return true;
      const one = first.pending === 1;
      const discard = await confirmAsync(
        `Discard ${one ? '1 change' : `${first.pending} changes`}?`,
        `${one ? '1 change on this device hasn’t' : `${first.pending} changes on this device haven’t`} synced, and ${
          one ? 'it won’t' : 'they won’t'
        } carry over to a different server or person.`,
        'Discard',
        true
      );
      if (!discard) return false;
      await signInAgain(serverUrl, token, { discard: true });
      return true;
    },
    [connected, connect, signInAgain]
  );
}

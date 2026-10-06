import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useTasks } from '../data/TaskContext';
import { codeFromPairingLink } from '../data/api';
import { useSidebar } from './SidebarContext';

/**
 * Opens Settings ready to approve a sign-in when this phone's camera scans the
 * QR another device is showing. The QR is a `yarukoto://pair?code=…` link, so
 * the system hands it to the app — cold or already running.
 *
 * Signed-in only: a phone that isn't signed in has nobody to approve as, and
 * the link means nothing to it.
 */
export default function PairLinkHandler() {
  const { state, household } = useTasks();
  const { openServer } = useSidebar();
  const ready = state.mode === 'server' && !!household?.me;

  useEffect(() => {
    if (!ready) return;
    const open = (url: string | null) => {
      const code = url ? codeFromPairingLink(url) : null;
      if (code) openServer(code);
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => open(url));
    return () => subscription.remove();
    // openServer is rebuilt with every sidebar change; re-subscribing on each
    // would replay the launch URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return null;
}

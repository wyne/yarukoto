import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import MacMenu from '../../modules/mac-menu/src/MacMenu';
import { DESKTOP_UI, MAC, MAC_KEYS } from '../data/platform';

/**
 * Hold ⌘ and the window labels what it can reach: ⌘1 beside All, ⌘, beside the
 * gear. In the collapsed icon rail, the already-held ⌘ is omitted so the
 * small badge can sit on one corner without hiding the icon. Each label is a
 * `ShortcutHint` beside the control it names; this is the half that knows when
 * they show.
 *
 * Only ⌘ on its own, and only once it has been held a moment: a shortcut typed
 * at speed never flashes them, and pressing a key or clicking with ⌘ down puts
 * them away, since that is ⌘ being used rather than looked at. Away from a Mac
 * the key is Control, which stands in for ⌘ in every shortcut there.
 */

/** Long enough that ⌘ on its way to a key stays quiet. */
export const HINT_DELAY_MS = 350;

let shown = false;
const subscribers = new Set<() => void>();

function setShown(next: boolean) {
  if (next === shown) return;
  shown = next;
  subscribers.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** Whether ⌘ has been held long enough for the hints to show. */
export function useShortcutHintsShown(): boolean {
  return useSyncExternalStore(subscribe, () => shown, () => shown);
}

/** Watches ⌘. Mounted once, with the menu commands. */
export function useCommandKeyHints() {
  useEffect(() => {
    if (!DESKTOP_UI) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hold = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setShown(true), HINT_DELAY_MS);
    };
    const release = () => {
      clearTimeout(timer);
      setShown(false);
    };
    // A ⌘ released over another app, or a window put away, never comes back up here.
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') release();
    });
    const cleanup = () => {
      appState.remove();
      release();
    };

    if (MAC) {
      // The native side says when ⌘ is alone, already ruling out keys and clicks.
      const subscription = MacMenu?.addListener('onCommandKey', ({ held }) => (held ? hold() : release()));
      return () => {
        subscription?.remove();
        cleanup();
      };
    }
    if (Platform.OS !== 'web') return cleanup;

    const key = MAC_KEYS ? 'Meta' : 'Control';
    const onKeyDown = (e: KeyboardEvent) => {
      // Windows repeats a held Control; one press is enough.
      if (e.repeat && e.key === key) return;
      const alone = e.key === key && !e.shiftKey && !e.altKey && (MAC_KEYS ? !e.ctrlKey : !e.metaKey);
      if (alone) hold();
      else release();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === key) release();
    };
    // Captured, as react-native-web's fields stop keys from bubbling.
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('pointerdown', release, true);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('pointerdown', release, true);
      window.removeEventListener('blur', release);
      cleanup();
    };
  }, []);
}

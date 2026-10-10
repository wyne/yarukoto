import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import MacMenu from '../../modules/mac-menu/src/MacMenu';
import { DESKTOP_APP, DESKTOP_UI, MAC } from '../data/platform';
import { LINKS, openLink } from '../data/links';
import { checkForAppUpdatesInteractively } from '../data/appUpdates';
import { PendingUndo, usePendingUndo, useTasks } from '../data/TaskContext';
import { anyLayerOpen } from '../components/openLayers';
import CommandPalette from '../components/CommandPalette';
import { COMMANDS, CommandId, commandDef, webCommandFor } from './commands';
import { navigationRef } from './DateTimePickerContext';
import { useSidebar } from './SidebarContext';

/**
 * The keyboard's commands, and who answers them.
 *
 * What the commands are lives in `commands.ts`. This is the other half: a
 * registry of handlers, filled by whatever is on screen, and the three ways a
 * command arrives — the Mac menu bar, a key on the web, and the command menu
 * (⌘K), which lists only what something can answer right now.
 *
 * Commands that act on a screen — New Task's add field, Find's search box, the
 * task list's cursor — are answered by the screen in front through
 * `useCommand`. New Task and Find also work from a screen without one: they go
 * to a screen that has it and wait there for it to register. Settings, the
 * command menu, the Help links and Undo belong to the whole app and are
 * answered here.
 *
 * Desktop only: a phone has no keyboard to send these.
 */

type Handler = () => void;

/** Registered handlers per command; the last one is the screen in front. */
const handlers = new Map<CommandId, Handler[]>();

/** Commands that work with nothing registered, by taking you somewhere that is. */
const FALLBACKS: Partial<Record<CommandId, () => void>> = {
  newTask: () => navigationRef.navigate('Main', { screen: 'InboxTab' }),
  find: () => navigationRef.navigate('Main', { screen: 'BrowseTab' }),
};

/**
 * A command sent ahead to a screen that hadn't registered yet. Short-lived, so a
 * screen opened by some other route much later doesn't act on a stale request.
 */
let pending: { command: CommandId; at: number } | null = null;
const PENDING_MS = 1500;

// What can be answered, as a store React and the menu bar both read.
const subscribers = new Set<() => void>();
let available: ReadonlySet<CommandId> = new Set(Object.keys(FALLBACKS) as CommandId[]);

function recompute() {
  const next = new Set<CommandId>(Object.keys(FALLBACKS) as CommandId[]);
  handlers.forEach((stack, id) => {
    if (stack.length) next.add(id);
  });
  if (next.size === available.size && [...next].every((id) => available.has(id))) return;
  available = next;
  subscribers.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** The commands something on screen can answer right now. */
export function useAvailableCommands(): ReadonlySet<CommandId> {
  return useSyncExternalStore(subscribe, () => available, () => available);
}

/** Runs a command. False when nothing could answer it. */
export function dispatchCommand(id: CommandId): boolean {
  // A key pressed in a popover or dialog is about that layer, never the list
  // behind it — whichever route it came by.
  if (commandDef(id).list && anyLayerOpen()) return false;
  const stack = handlers.get(id);
  if (stack?.length) {
    stack[stack.length - 1]();
    return true;
  }
  const fallback = FALLBACKS[id];
  if (!fallback) return false;
  pending = { command: id, at: Date.now() };
  fallback();
  return true;
}

/** Answers a command while `active`. The most recently activated answer wins. */
function useCommandHandler(id: CommandId, handler: Handler, active: boolean) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!active) return;
    const run = () => latest.current();
    const stack = handlers.get(id) ?? [];
    handlers.set(id, [...stack, run]);
    recompute();
    if (pending?.command === id && Date.now() - pending.at < PENDING_MS) {
      pending = null;
      // A frame late, so a screen that just mounted has laid its field out.
      requestAnimationFrame(run);
    }
    return () => {
      handlers.set(id, (handlers.get(id) ?? []).filter((h) => h !== run));
      recompute();
    };
  }, [id, active]);
}

/**
 * `useIsFocused`, minus its throw outside a screen. A bottom sheet's content
 * is portalled to `BottomSheetModalProvider`, which sits above the
 * NavigationContainer, so the phone's task sheet has no navigation at all;
 * there it counts as in front, since a sheet only shows over the screen in use.
 */
function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!navigation) return () => {};
      const offFocus = navigation.addListener('focus', callback);
      const offBlur = navigation.addListener('blur', callback);
      return () => {
        offFocus();
        offBlur();
      };
    },
    [navigation]
  );
  const isFocused = () => navigation?.isFocused() ?? true;
  return useSyncExternalStore(subscribe, isFocused, isFocused);
}

/**
 * Answers a command while this screen is in front, and `enabled`.
 *
 * Tab screens stay mounted when you leave them, so registering only while
 * focused is what makes the answer come from the screen you're looking at
 * rather than whichever mounted last. A command nothing answers is dimmed in
 * the menu bar and left out of the command menu, so pass `enabled` false when
 * there is nothing for it to act on.
 */
export function useCommand(id: CommandId, handler: Handler, enabled = true) {
  const focused = useScreenFocused();
  useCommandHandler(id, handler, DESKTOP_UI && enabled && focused);
}

/** Whether a key event's target is somewhere text is typed. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** The name Edit ▸ Undo shows as "Undo …". */
const UNDO_ACTION_NAME: Record<PendingUndo['kind'], string> = {
  complete: 'Complete Task',
  delete: 'Move to Trash',
};

const openSetupGuide = () => openLink(LINKS.setupGuide);
const openSupport = () => openLink(LINKS.support);
const openPrivacy = () => openLink(LINKS.privacy);

/** Mounted once, in the main layout, so it never runs over the first-run screen. */
export default function MenuCommands() {
  const { openServer } = useSidebar();
  const { undo } = useTasks();
  const pendingUndo = usePendingUndo();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useCommandHandler('settings', openServer, DESKTOP_UI);
  useCommandHandler('checkForUpdates', () => void checkForAppUpdatesInteractively(), DESKTOP_APP);
  useCommandHandler('commandMenu', useCallback(() => setPaletteOpen(true), []), DESKTOP_UI);
  useCommandHandler('help', openSetupGuide, DESKTOP_UI);
  useCommandHandler('support', openSupport, DESKTOP_UI);
  useCommandHandler('privacy', openPrivacy, DESKTOP_UI);

  const latest = useRef({ undo });
  latest.current = { undo };

  // The menu bar: built from the command list once, then dimmed and lit as
  // screens come and go.
  const enabled = useAvailableCommands();
  useEffect(() => {
    if (!MAC || !MacMenu) return;
    MacMenu.setCommands(
      // Only what has a place in the menus; list movement doesn't.
      COMMANDS.filter((c) => c.menu).map((c) => ({
        id: c.id,
        title: c.title,
        menu: c.menu!,
        group: c.group,
        submenu: c.submenu,
        input: c.shortcut?.input,
        modifiers: c.shortcut?.modifiers ?? [],
        list: !!c.list,
      }))
    );
    const subscription = MacMenu.addListener('onCommand', ({ command }) => {
      if (command === 'undo') latest.current.undo();
      else dispatchCommand(command as CommandId);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!MAC || !MacMenu) return;
    MacMenu.setEnabled([...enabled]);
  }, [enabled]);

  // The web: the shortcuts a browser lets a page have.
  useEffect(() => {
    if (Platform.OS !== 'web' || !DESKTOP_UI) return;
    const onKey = (e: KeyboardEvent) => {
      // Held arrows repeat, as they do in any list; nothing else should.
      if (e.defaultPrevented || (e.repeat && !e.key.startsWith('Arrow'))) return;
      const match = webCommandFor(e);
      if (!match) return;
      // A plain list key belongs to the field being typed in; a shortcut with
      // ⌘ is a command whatever has focus, as it is in the Mac's menu bar.
      if (match.listKey && typingIn(e.target)) return;
      const { def } = match;
      if (dispatchCommand(def.id)) e.preventDefault();
    };
    // react-native-web's TextInput stops every keydown from bubbling, so from a
    // text field nothing reaches the listener below: ⌘K in the add field did
    // nothing, nor ⌘B in notes. A key typed in a field is taken on the way down
    // instead. Only ⌘ shortcuts can match there, since list keys are left to the
    // field; anything else still waits for the way up, so whatever answers a
    // key itself gets the first say. AltGr is left alone: on Windows it arrives
    // as Ctrl+Alt, and AltGr+0 is how many layouts type a brace.
    const onKeyInField = (e: KeyboardEvent) => {
      if (typingIn(e.target) && !e.getModifierState?.('AltGraph')) onKey(e);
    };
    document.addEventListener('keydown', onKeyInField, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKeyInField, true);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Offered for as long as the toast is, and withdrawn with it. Keyed on the
  // token so completing a second task re-registers rather than keeping the first.
  const undoToken = pendingUndo?.token ?? null;
  const undoKind = pendingUndo?.kind ?? null;
  useEffect(() => {
    if (!MAC || !MacMenu) return;
    MacMenu.setUndo(undoToken === null || undoKind === null ? null : UNDO_ACTION_NAME[undoKind]);
  }, [undoToken, undoKind]);

  if (!DESKTOP_UI) return null;
  return <CommandPalette visible={paletteOpen} onClose={() => setPaletteOpen(false)} />;
}

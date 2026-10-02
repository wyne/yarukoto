import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import MacMenu from '../../modules/mac-menu/src/MacMenu';
import { DESKTOP_UI, MAC } from '../data/platform';
import { usePendingUndo, useTasks } from '../data/TaskContext';
import { anyLayerOpen } from '../components/openLayers';
import CommandPalette from '../components/CommandPalette';
import { COMMANDS, CommandId, webCommandFor } from './commands';
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
 * command menu and Undo belong to the whole app and are answered here.
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
 * Answers a command while this screen is in front, and `enabled`.
 *
 * Tab screens stay mounted when you leave them, so registering only while
 * focused is what makes the answer come from the screen you're looking at
 * rather than whichever mounted last. A command nothing answers is dimmed in
 * the menu bar and left out of the command menu, so pass `enabled` false when
 * there is nothing for it to act on.
 */
export function useCommand(id: CommandId, handler: Handler, enabled = true) {
  const focused = useIsFocused();
  useCommandHandler(id, handler, DESKTOP_UI && enabled && focused);
}

/** Whether a key event's target is somewhere text is typed. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** The name Edit ▸ Undo shows as "Undo …". */
const UNDO_ACTION_NAME = 'Complete Task';

/** Mounted once, in the main layout, so it never runs over the first-run screen. */
export default function MenuCommands() {
  const { openServer } = useSidebar();
  const { undoComplete } = useTasks();
  const pendingUndo = usePendingUndo();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useCommandHandler('settings', openServer, DESKTOP_UI);
  useCommandHandler('commandMenu', useCallback(() => setPaletteOpen(true), []), DESKTOP_UI);

  const latest = useRef({ undoComplete });
  latest.current = { undoComplete };

  // The menu bar: built from the command list once, then dimmed and lit as
  // screens come and go.
  const enabled = useAvailableCommands();
  useEffect(() => {
    if (!MAC || !MacMenu) return;
    MacMenu.setCommands(
      COMMANDS.map((c) => ({
        id: c.id,
        title: c.title,
        menu: c.menu,
        group: c.group,
        submenu: c.submenu,
        input: c.shortcut?.input,
        modifiers: c.shortcut?.modifiers ?? [],
        list: !!c.list,
      }))
    );
    const subscription = MacMenu.addListener('onCommand', ({ command }) => {
      if (command === 'undo') latest.current.undoComplete();
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
      const def = webCommandFor(e);
      if (!def) return;
      if (def.list) {
        if (anyLayerOpen()) return;
        // A plain key belongs to the field being typed in; one with ⌘ or ⌥ is
        // a command whatever has focus, as it is in the Mac's menu bar.
        const plain = !def.shortcut!.modifiers.some((m) => m === 'command' || m === 'option');
        if (plain && typingIn(e.target)) return;
      }
      if (dispatchCommand(def.id)) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Offered for as long as the toast is, and withdrawn with it. Keyed on the
  // token so completing a second task re-registers rather than keeping the first.
  const undoToken = pendingUndo?.token ?? null;
  useEffect(() => {
    if (!MAC || !MacMenu) return;
    MacMenu.setUndo(undoToken === null ? null : UNDO_ACTION_NAME);
  }, [undoToken]);

  if (!DESKTOP_UI) return null;
  return <CommandPalette visible={paletteOpen} onClose={() => setPaletteOpen(false)} />;
}

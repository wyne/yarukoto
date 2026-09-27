import { useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import MacMenu from '../../modules/mac-menu/src/MacMenu';
import { MAC } from '../data/platform';
import { usePendingUndo, useTasks } from '../data/TaskContext';
import { navigationRef } from './DateTimePickerContext';
import { useSidebar } from './SidebarContext';

/**
 * The Mac menu bar's commands, and who answers them.
 *
 * New Task and Find act on a field that belongs to a screen — the pinned
 * quick-add field, Browse's search box — so the screen in front answers them
 * through `useMenuCommand`. When it has no such field, the command goes to a
 * screen that does and waits there for it to register: New Task to the Inbox,
 * Find to Browse. Settings and Undo belong to the whole app and are answered
 * here.
 *
 * The menu itself is native (modules/mac-menu). Mac only: nothing else has a
 * menu bar to choose these from.
 */

type ScreenCommand = 'newTask' | 'find';

/** Registered handlers per command; the last one is the screen in front. */
const handlers: Record<ScreenCommand, (() => void)[]> = { newTask: [], find: [] };

/**
 * A command sent ahead to a screen that hadn't registered yet. Short-lived, so a
 * screen opened by some other route much later doesn't act on a stale request.
 */
let pending: { command: ScreenCommand; at: number } | null = null;
const PENDING_MS = 1500;

function dispatch(command: ScreenCommand, fallback: () => void) {
  const stack = handlers[command];
  if (stack.length) {
    stack[stack.length - 1]();
    return;
  }
  pending = { command, at: Date.now() };
  fallback();
}

/**
 * Answers a menu command while this screen is in front.
 *
 * Tab screens stay mounted when you leave them, so registering only while
 * focused is what makes the answer come from the screen you're looking at
 * rather than whichever mounted last.
 */
export function useMenuCommand(command: ScreenCommand, handler: () => void, enabled = true) {
  const focused = useIsFocused();
  const latest = useRef(handler);
  latest.current = handler;

  const active = MAC && enabled && focused;
  useEffect(() => {
    if (!active) return;
    const run = () => latest.current();
    handlers[command].push(run);
    if (pending?.command === command && Date.now() - pending.at < PENDING_MS) {
      pending = null;
      // A frame late, so a screen that just mounted has laid its field out.
      requestAnimationFrame(run);
    }
    return () => {
      const stack = handlers[command];
      stack.splice(stack.indexOf(run), 1);
    };
  }, [command, active]);
}

/** The name Edit ▸ Undo shows as "Undo …". */
const UNDO_ACTION_NAME = 'Complete Task';

/** Mounted once, in the main layout, so it never runs over the first-run screen. */
export default function MenuCommands() {
  const { openServer } = useSidebar();
  const { undoComplete } = useTasks();
  const pendingUndo = usePendingUndo();

  const latest = useRef({ openServer, undoComplete });
  latest.current = { openServer, undoComplete };

  useEffect(() => {
    if (!MAC || !MacMenu) return;
    const subscription = MacMenu.addListener('onCommand', ({ command }) => {
      switch (command) {
        case 'newTask':
          dispatch('newTask', () => navigationRef.navigate('Main', { screen: 'InboxTab' }));
          break;
        case 'find':
          dispatch('find', () => navigationRef.navigate('Main', { screen: 'BrowseTab' }));
          break;
        case 'settings':
          latest.current.openServer();
          break;
        case 'undo':
          latest.current.undoComplete();
          break;
      }
    });
    return () => subscription.remove();
  }, []);

  // Offered for as long as the toast is, and withdrawn with it. Keyed on the
  // token so completing a second task re-registers rather than keeping the first.
  const undoToken = pendingUndo?.token ?? null;
  useEffect(() => {
    if (!MAC || !MacMenu) return;
    MacMenu.setUndo(undoToken === null ? null : UNDO_ACTION_NAME);
  }, [undoToken]);

  return null;
}

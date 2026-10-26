import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import MacMenu from '../../modules/mac-menu/src/MacMenu';
import { DESKTOP_APP, DESKTOP_UI, MAC } from '../data/platform';
import { LINKS, openLink } from '../data/links';
import { checkForAppUpdatesInteractively } from '../data/appUpdates';
import { PendingUndo, usePendingUndo, useTasks } from '../data/TaskContext';
import { afterLayersClose, anyLayerOpen } from '../components/openLayers';
import CommandPalette from '../components/CommandPalette';
import { COMMANDS, CommandId, commandDef, createKeySequenceReader, domKeyName, webCommandFor } from './commands';
import { currentDestination, goBack, goForward, useNavHistory, watchNavHistory } from './navHistory';
import { navigationRef } from './DateTimePickerContext';
import { tabNavigation } from './destinations';
import { useDrawerState, useSidebar, useSidebarCollapsed } from './SidebarContext';
import { focusPane, sidebarHoldsKeyboard } from './focusPanes';
import { useCommandKeyHints } from './shortcutHints';
import type { PalettePicker } from '../data/palettePickers';

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
 * command menu, the views (⌘1–⌘8), the Help links and Undo belong to the whole app and are
 * answered here, as are Back and Forward.
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
 * Answers for when nothing on screen has one of its own, which, unlike a
 * fallback, need nothing to register afterwards. Next and Previous View are the
 * sidebar's, in its own order; with no sidebar to answer — a narrow window whose
 * drawer is shut — they go round the fixed views.
 */
const DEFAULTS: Partial<Record<CommandId, () => void>> = {
  nextView: () => stepFixedView(1),
  previousView: () => stepFixedView(-1),
};

/**
 * A command sent ahead to a screen that hadn't registered yet. Short-lived, so a
 * screen opened by some other route much later doesn't act on a stale request.
 */
let pending: { command: CommandId; at: number } | null = null;
const PENDING_MS = 1500;

// What can be answered, as a store React and the menu bar both read.
const subscribers = new Set<() => void>();
const ALWAYS = [...Object.keys(FALLBACKS), ...Object.keys(DEFAULTS)] as CommandId[];
let available: ReadonlySet<CommandId> = new Set(ALWAYS);

/** How many answers in force say each command is the option in use. */
const checks = new Map<CommandId, number>();
let checked: ReadonlySet<CommandId> = new Set();

const sameSet = (a: ReadonlySet<CommandId>, b: ReadonlySet<CommandId>) =>
  a.size === b.size && [...a].every((id) => b.has(id));

function recompute() {
  const next = new Set<CommandId>(ALWAYS);
  handlers.forEach((stack, id) => {
    if (stack.length) next.add(id);
  });
  const nextChecked = new Set<CommandId>();
  checks.forEach((count, id) => {
    if (count > 0 && next.has(id)) nextChecked.add(id);
  });
  if (sameSet(next, available) && sameSet(nextChecked, checked)) return;
  if (!sameSet(next, available)) available = next;
  if (!sameSet(nextChecked, checked)) checked = nextChecked;
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

/**
 * The commands that are the option in use — View ▸ Group By's current grouping,
 * say. Checked in the menu bar, and left out of the command menu, where
 * choosing what is already chosen would do nothing.
 */
export function useCheckedCommands(): ReadonlySet<CommandId> {
  return useSyncExternalStore(subscribe, () => checked, () => checked);
}

/**
 * Runs a command. False when nothing could answer it.
 *
 * `fromPalette` is the command menu running a picker command (Move to List…),
 * whose picker opens in the menu itself: the one layer a list command may act
 * from, since what it opens is that same layer.
 */
export function dispatchCommand(id: CommandId, fromPalette = false): boolean {
  // A key pressed in a popover or dialog is about that layer, never the list
  // behind it — whichever route it came by.
  if (commandDef(id).list && anyLayerOpen() && !(fromPalette && commandDef(id).picker)) return false;
  const stack = handlers.get(id);
  if (stack?.length) {
    stack[stack.length - 1]();
    return true;
  }
  const answer = DEFAULTS[id];
  if (answer) {
    answer();
    return true;
  }
  const fallback = FALLBACKS[id];
  if (!fallback) return false;
  pending = { command: id, at: Date.now() };
  fallback();
  return true;
}

/** Answers a command while `active`. The most recently activated answer wins. */
function useCommandHandler(id: CommandId, handler: Handler, active: boolean, isChecked = false) {
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

  const checking = active && isChecked;
  useEffect(() => {
    if (!checking) return;
    checks.set(id, (checks.get(id) ?? 0) + 1);
    recompute();
    return () => {
      checks.set(id, (checks.get(id) ?? 1) - 1);
      recompute();
    };
  }, [id, checking]);
}

/**
 * `useIsFocused`, minus its throw outside a screen. A bottom sheet's content
 * is portalled to `BottomSheetModalProvider`, which sits above the
 * NavigationContainer, so the phone's task sheet has no navigation at all;
 * there it counts as in front, since a sheet only shows over the screen in use.
 */
export function useScreenFocused(): boolean {
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
export function useCommand(id: CommandId, handler: Handler, enabled = true, isChecked = false) {
  const focused = useScreenFocused();
  useCommandHandler(id, handler, DESKTOP_UI && enabled && focused, isChecked);
}

/** Whether a key event's target is somewhere text is typed. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
const REPEATING_KEYS = new Set(['j', 'k', 'e', 'y']);

/** A key that types a character, alone or with ⇧ or ⌃: one of vim's list keys. */
function typesCharacter(e: KeyboardEvent): boolean {
  return e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.altKey;
}

/** The web's reader of two-key list keys (`gg`, `za`); the Mac's is in ListKeys. */
const readSequence = createKeySequenceReader();

/** Asked of the command menu by a picker command; see `showPalettePicker`. */
let pickerListener: ((picker: PalettePicker) => void) | null = null;

/** Opens the command menu on a picker, or swaps its search for one if it is already open. */
export function showPalettePicker(picker: PalettePicker) {
  pickerListener?.(picker);
}

/** The name Edit ▸ Undo shows as "Undo …". */
const UNDO_ACTION_NAME: Record<PendingUndo['kind'], string> = {
  complete: 'Complete Task',
  delete: 'Move to Trash',
};

/** The sidebar's views, as View ▸ ⌘1–⌘8 reach them. */
function goTo(route: string) {
  const [name, params] = tabNavigation(route);
  (navigationRef.navigate as (name: string, params?: object) => void)('Main', { screen: name, params });
}
const goAll = () => goTo('AllTab');
const goInbox = () => goTo('InboxTab');
const goToday = () => goTo('TodayTab');
const goCalendar = () => goTo('CalendarTab');
const goActivity = () => goTo('ActivityTab');
const goBrowse = () => goTo('BrowseTab');
const goTrash = () => goTo('TrashTab');
const goArchive = () => goTo('ArchiveTab');

/** The fixed views, in sidebar order. */
const VIEW_ROUTES = ['AllTab', 'InboxTab', 'TodayTab', 'CalendarTab', 'ActivityTab', 'BrowseTab', 'TrashTab', 'ArchiveTab'];

/** The next or previous fixed view, round again at the ends. From a list or tag, the first or last. */
function stepFixedView(delta: 1 | -1) {
  const here = currentDestination();
  const at = here && !here.params ? VIEW_ROUTES.indexOf(here.route) : -1;
  const n = VIEW_ROUTES.length;
  goTo(VIEW_ROUTES[at === -1 ? (delta === 1 ? 0 : n - 1) : (at + delta + n) % n]);
}

const openSetupGuide = () => openLink(LINKS.setupGuide);
const openSupport = () => openLink(LINKS.support);
const openPrivacy = () => openLink(LINKS.privacy);

/** Mounted once, in the main layout, so it never runs over the first-run screen. */
export default function MenuCommands() {
  const { openServer, wide, railOnly, toggleCollapsed, openDrawer } = useSidebar();
  const collapsed = useSidebarCollapsed();
  const { undo } = useTasks();
  const pendingUndo = usePendingUndo();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [picker, setPicker] = useState<{ picker: PalettePicker; fromSearch: boolean } | null>(null);
  const searchingNow = useRef(false);
  searchingNow.current = paletteOpen && !picker;
  /** What the menu shows, if it is up: the search, or a picker by kind. */
  const showingNow = useRef<PalettePicker['kind'] | 'search' | null>(null);
  showingNow.current = paletteOpen ? picker?.picker.kind ?? 'search' : null;
  // Escape from a picker reached through the search goes back to the search;
  // from one that replaced another picker, it closes, as that one's would have.
  const openPicker = useCallback((next: PalettePicker) => {
    setPicker({ picker: next, fromSearch: searchingNow.current });
    setPaletteOpen(true);
  }, []);
  useEffect(() => {
    if (!DESKTOP_UI) return;
    pickerListener = openPicker;
    return () => {
      pickerListener = null;
    };
  }, [openPicker]);
  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setPicker(null);
  }, []);

  useCommandHandler('settings', openServer, DESKTOP_UI);
  useCommandHandler('checkForUpdates', () => void checkForAppUpdatesInteractively(), DESKTOP_APP);
  // A menu's own key, pressed again while it is up, puts it away.
  useCommandHandler(
    'commandMenu',
    useCallback(() => {
      if (showingNow.current === 'search') return closePalette();
      setPicker(null);
      setPaletteOpen(true);
    }, [closePalette]),
    DESKTOP_UI
  );
  // The command menu again, searching tasks or the keys: pickers with nothing to
  // act on. One dialog shows all three, so pressing one key while another's menu
  // is up swaps what it shows rather than stacking a second dialog on the first.
  const togglePicker = useCallback(
    (next: PalettePicker) => (showingNow.current === next.kind ? closePalette() : openPicker(next)),
    [closePalette, openPicker]
  );
  useCommandHandler('goToTask', useCallback(() => togglePicker({ kind: 'goToTask' }), [togglePicker]), DESKTOP_UI);
  useCommandHandler(
    'keyboardShortcuts',
    useCallback(() => togglePicker({ kind: 'keyboardShortcuts' }), [togglePicker]),
    DESKTOP_UI
  );
  // A narrow window has no pinned sidebar to shrink, and a rail-only one no room
  // to grow it; the key shows and hides the drawer instead.
  //
  // Showing the full sidebar hands it the keyboard too, so the arrows go
  // straight on to move through it. Shrinking it leaves the keyboard where it was.
  const { drawerOpen, closeDrawer } = useDrawerState();
  const toggleSidebar = useCallback(() => {
    if (wide && !railOnly) {
      toggleCollapsed();
      if (collapsed) afterLayersClose(() => focusPane('sidebar'));
    } else if (drawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
      // The drawer's sidebar takes the keyboard as it mounts, and lets go of it as it closes.
      focusPane('sidebar', { mounting: true });
    }
  }, [wide, railOnly, collapsed, drawerOpen, toggleCollapsed, closeDrawer, openDrawer]);
  useCommandHandler('toggleSidebar', toggleSidebar, DESKTOP_UI);
  useCommandHandler('goAll', goAll, DESKTOP_UI);
  useCommandHandler('goInbox', goInbox, DESKTOP_UI);
  useCommandHandler('goToday', goToday, DESKTOP_UI);
  useCommandHandler('goCalendar', goCalendar, DESKTOP_UI);
  useCommandHandler('goActivity', goActivity, DESKTOP_UI);
  useCommandHandler('goBrowse', goBrowse, DESKTOP_UI);
  useCommandHandler('goTrash', goTrash, DESKTOP_UI);
  useCommandHandler('goArchive', goArchive, DESKTOP_UI);
  useEffect(() => (DESKTOP_UI ? watchNavHistory() : undefined), []);
  const { canGoBack, canGoForward } = useNavHistory();
  useCommandHandler('goBack', goBack, DESKTOP_UI && canGoBack);
  useCommandHandler('goForward', goForward, DESKTOP_UI && canGoForward);
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
        aliases: (c.aliases ?? []).map(({ input, modifiers }) => ({ input, modifiers })),
        list: !!c.list,
        yieldsToText: !!c.yieldsToText,
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
  const checkedNow = useCheckedCommands();
  useEffect(() => {
    if (!MAC || !MacMenu) return;
    MacMenu.setChecked([...checkedNow]);
  }, [checkedNow]);

  useCommandKeyHints();

  // The web: the shortcuts a browser lets a page have.
  useEffect(() => {
    if (Platform.OS !== 'web' || !DESKTOP_UI) return;
    const onKey = (e: KeyboardEvent) => {
      // Held arrows repeat, as they do in any list, and vim's j, k, ⌃E and ⌃Y
      // with them; nothing else should.
      if (e.defaultPrevented || (e.repeat && !e.key.startsWith('Arrow') && !REPEATING_KEYS.has(e.key))) return;
      const match = webCommandFor(e);
      if (match && !match.listKey) {
        // A key a field has its own use for stays with the field.
        if (match.def.yieldsToText && typingIn(e.target)) return;
        if (dispatchCommand(match.def.id)) e.preventDefault();
        return;
      }
      // A plain list key belongs to the field being typed in; a shortcut with
      // ⌘ is a command whatever has focus, as it is in the Mac's menu bar.
      // Shift on its own, on the way to a G, is no key at all.
      if (typingIn(e.target) || MODIFIER_KEYS.has(e.key)) return;
      // The sidebar answers its own arrows, but a letter would get past it to
      // the list behind; on the Mac the list only hears one while it has focus.
      if (sidebarHoldsKeyboard() && typesCharacter(e)) return;
      const sequence = readSequence(domKeyName(e));
      if (sequence === 'pending') return e.preventDefault();
      const id = sequence ?? match?.def.id;
      if (id && dispatchCommand(id)) e.preventDefault();
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
  return (
    <CommandPalette
      visible={paletteOpen}
      onClose={closePalette}
      picker={picker?.picker ?? null}
      onLeavePicker={picker?.fromSearch ? () => setPicker(null) : closePalette}
    />
  );
}

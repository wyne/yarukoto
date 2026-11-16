import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useWindowSelector } from '../components/useWindowSelector';
import { FINE_POINTER } from '../data/platform';
import { loadSidebarRail, loadSidebarWidth, saveSidebarRail, saveSidebarWidth } from '../data/storage';

/** Narrower on the desktop, where the rows are denser and a window has less to give. */
export const SIDEBAR_WIDTH = FINE_POINTER ? 280 : 300;
/** Icon-only rail when the pinned sidebar is collapsed. */
export const SIDEBAR_COLLAPSED_WIDTH = 64;

/**
 * The range the pinned sidebar can be dragged across.
 *
 * Narrower than the minimum, list names are cut to a few letters and the rail
 * says as much in less room, so a drag past it snaps to the rail instead. Wider
 * than the maximum takes room from the list without showing more of the nav.
 */
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 360;

/**
 * Only with a pointer. A finger has nothing to drag at the edge of a pinned
 * sidebar that a scroll or a swipe would not also want, and a tablet's sidebar
 * is sized for its touch targets rather than its text.
 */
export const SIDEBAR_RESIZABLE = FINE_POINTER;

/**
 * The narrowest list a desktop window keeps beside the pinned sidebar.
 *
 * The desktop list is dense enough to read comfortably at this width, so the
 * sidebar stays pinned until the list would get narrower than this, rather than
 * at a fixed window width chosen for touch-sized rows.
 */
export const DESKTOP_LIST_MIN_WIDTH = 440;

/**
 * Above this width the sidebar is pinned open and the bottom tab bar goes away.
 *
 * A touch layout keeps 900, where its larger rows still have room beside the
 * full sidebar.
 */
export const WIDE_BREAKPOINT = FINE_POINTER ? SIDEBAR_WIDTH + DESKTOP_LIST_MIN_WIDTH : 900;


/**
 * The drawer's motion, up here because two places drive it.
 *
 * The drawer animates itself when it is opened or closed outright, and the edge
 * swipe hands it a position directly — but whichever ends the gesture has to
 * finish the movement in the same hand, or releasing a swipe would look like a
 * different drawer from tapping the menu.
 *
 * Opening decelerates and closing accelerates, rather than easing at both ends.
 * A panel arriving under your thumb should look like it is being caught, and one
 * leaving like it is being let go. Symmetric easing gives both halves the same
 * hesitant start, which reads as the drawer thinking about it.
 */
/**
 * Whether the drawer exists before it is opened.
 *
 * iOS keeps it in a window overlay that is mounted for the life of the app, so
 * the panel is always there to be moved. Elsewhere it is a Modal that does not
 * exist until it opens, and nothing can be animated into a host that has not
 * been presented yet — that one has to wait to be told it is on screen.
 */
export const DRAWER_PREMOUNTED = Platform.OS === 'ios';

export const DRAWER_OPEN_MS = 280;
export const DRAWER_CLOSE_MS = 220;
export const DRAWER_OPEN_EASING = Easing.out(Easing.cubic);
export const DRAWER_CLOSE_EASING = Easing.in(Easing.cubic);

/** Caps the reading width of a screen's content on wide layouts. */
export const PANE_MAX_WIDTH = 900;

/**
 * A sheet the nav opens. Referred to by id rather than by record, so the sheet
 * follows an edit made while it is open — and so the nav can be gone by the
 * time it renders.
 */
export type NavSheet =
  | { kind: 'renameList'; id: string }
  | { kind: 'renameFolder'; id: string }
  | { kind: 'newList'; folderId: string | null }
  | { kind: 'newFolder' };

interface SidebarValue {
  /** The sidebar is pinned beside the content, in full or as a rail. */
  wide: boolean;
  /**
   * Pinned, but only as a rail: a desktop window narrower than
   * `WIDE_BREAKPOINT`. Expanding it opens the full sidebar as the drawer, over
   * the content, since there is no room to push the content aside for it.
   */
  railOnly: boolean;
  openDrawer: () => void;
  /**
   * How far the drawer is out: 0 shut, 1 fully open.
   *
   * Owned here rather than by the drawer because the edge swipe that opens it
   * cannot live with it. The drawer is hosted in a window of its own on iOS, and
   * a separate window cannot hand a rejected touch back to the app underneath —
   * an edge catcher there would eat every touch down that side of the screen.
   * So the gesture sits out in the layout and the two meet on this value.
   *
   * `drawerOpen` is the settled intent; this is where the panel actually is. A
   * finger halfway through a swipe has moved one and not the other.
   */
  drawerProgress: SharedValue<number>;
  /** Shrinks the pinned sidebar to an icon rail and back. Stable; the state is in `useSidebarCollapsed`. */
  toggleCollapsed: () => void;
  /** Server sheet lives at the Layout level so it survives the drawer closing. */
  serverOpen: boolean;
  /** `pairCode` opens it ready to approve a sign-in from a scanned QR. */
  openServer: (pairCode?: string) => void;
  /** The code the server sheet was last opened to approve, if any. */
  serverPairCode: string | null;
  closeServer: () => void;
  /**
   * The nav's own sheets, up here for the same reason the server sheet is.
   *
   * They are presented by a provider mounted above the navigator, so opening
   * one from inside the drawer draws it *behind* the drawer — and closing the
   * drawer first is no fix either, because that unmounts the nav and takes the
   * sheet down with it. Owning them at the Layout level is what lets the drawer
   * close and the sheet stay.
   */
  navSheet: NavSheet | null;
  openNavSheet: (sheet: NavSheet) => void;
  closeNavSheet: () => void;
}

interface SidebarWidthValue {
  /**
   * The full pinned sidebar's width as drawn: the width it was dragged to,
   * narrowed where the window would otherwise leave the list less than
   * `DESKTOP_LIST_MIN_WIDTH`. The chosen width is kept for when it widens.
   */
  width: number;
  /** The widest a drag can take it in this window. */
  maxWidth: number;
  /** Clamped to the range. `save` is for the end of a drag, not every frame of it. */
  setWidth: (width: number, save?: boolean) => void;
  /** Back to the default width, out of the rail if it was in it. */
  resetWidth: () => void;
  /** The rail, explicitly — a drag snaps to it rather than toggling. */
  setRail: (rail: boolean) => void;
}

interface DrawerStateValue {
  drawerOpen: boolean;
  closeDrawer: () => void;
}

const SidebarContext = createContext<SidebarValue | null>(null);
const DrawerStateContext = createContext<DrawerStateValue | null>(null);
/**
 * Wide layouts only: whether the pinned sidebar is an icon rail.
 *
 * Isolated for the same reason as the drawer state. Every screen and every task
 * row reads `useSidebar()` for `wide`, so a rail toggle carried in that value
 * re-rendered all of them before the sidebar could move, which is what made ⌘S lag.
 */
const CollapsedContext = createContext(false);
/**
 * The pinned sidebar's width, isolated for the same reason: a drag sets it on
 * every frame, and only the sidebar and the row it sits in are sized by it.
 */
const SidebarWidthContext = createContext<SidebarWidthValue>({
  width: SIDEBAR_WIDTH,
  maxWidth: SIDEBAR_WIDTH,
  setWidth: () => {},
  resetWidth: () => {},
  setRail: () => {},
});

const clampWidth = (width: number) => Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // Below the wide breakpoint a desktop window keeps the sidebar as its icon
  // rail however narrow it gets: with a mouse the nav is one click away there,
  // where a drawer would hide it behind a menu button. Only touch layouts trade
  // it for the tab bar, since a phone turned on its side is just as wide.
  const layout = useWindowSelector((window) =>
    window.width >= WIDE_BREAKPOINT ? 'full' : FINE_POINTER ? 'rail' : 'narrow'
  );
  const wide = layout !== 'narrow';
  const railOnly = layout === 'rail';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(loadSidebarRail);
  const [chosenWidth, setChosenWidth] = useState(() => {
    const stored = SIDEBAR_RESIZABLE ? loadSidebarWidth() : null;
    return stored === null ? SIDEBAR_WIDTH : clampWidth(stored);
  });
  /**
   * The widest sidebar that still leaves the list its room. Never below the
   * default: under `WIDE_BREAKPOINT` the window drops to the rail anyway, so a
   * dragged width only ever gives back what it took beyond the default, and the
   * breakpoint stays where it was before the sidebar could be resized.
   */
  const roomForSidebar = useWindowSelector((window) =>
    SIDEBAR_RESIZABLE
      ? Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_WIDTH, window.width - DESKTOP_LIST_MIN_WIDTH))
      : SIDEBAR_WIDTH
  );
  const [serverOpen, setServerOpen] = useState(false);
  const [serverPairCode, setServerPairCode] = useState<string | null>(null);
  const [navSheet, setNavSheet] = useState<NavSheet | null>(null);
  const drawerProgress = useSharedValue(0);

  // The drawer is a narrow-layout affordance; room for the full sidebar pins it instead.
  useEffect(() => {
    if (layout === 'full') setDrawerOpen(false);
  }, [layout]);

  /**
   * Both of these move the panel before telling React anything.
   *
   * Waiting on state used to be a visible pause. The progress value moves on the
   * UI thread first, while the isolated drawer-state context catches React up
   * without invalidating the mounted screens behind it. Tapping the menu and
   * dragging the panel therefore begin through the same animation path.
   *
   * The drawer runs the same movement again when the state does land, which is
   * a frame or two later and from wherever this got to. Durations scale to the
   * distance left, so what it re-issues is all but identical to what is already
   * running — and it is the one carrying the callback that tears the drawer
   * down at the end of a close.
   */
  const startOpening = useCallback(() => {
    // Not off iOS: there the drawer is a Modal that does not exist until it is
    // opened, and animating one before it has been presented is exactly the
    // wait this is trying to remove. It waits for `onShow` instead.
    if (!DRAWER_PREMOUNTED) return;
    drawerProgress.value = withTiming(1, {
      duration: DRAWER_OPEN_MS * (1 - drawerProgress.value),
      easing: DRAWER_OPEN_EASING,
    });
  }, [drawerProgress]);

  // Always safe, on any platform: something being closed is on screen already.
  const startClosing = useCallback(() => {
    drawerProgress.value = withTiming(0, {
      duration: DRAWER_CLOSE_MS * drawerProgress.value,
      easing: DRAWER_CLOSE_EASING,
    });
  }, [drawerProgress]);

  const dismissDrawer = useCallback(() => {
    startClosing();
    setDrawerOpen(false);
  }, [startClosing]);

  const openDrawer = useCallback(() => {
    startOpening();
    setDrawerOpen(true);
  }, [startOpening]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      saveSidebarRail(!v);
      return !v;
    });
  }, []);

  const setRail = useCallback((rail: boolean) => {
    setCollapsed(rail);
    saveSidebarRail(rail);
  }, []);

  const setWidth = useCallback((width: number, save?: boolean) => {
    const next = clampWidth(width);
    setChosenWidth(next);
    // The default is stored as nothing, so a later change of default reaches it.
    if (save) saveSidebarWidth(next === SIDEBAR_WIDTH ? null : next);
  }, []);

  const resetWidth = useCallback(() => {
    setChosenWidth(SIDEBAR_WIDTH);
    saveSidebarWidth(null);
    setRail(false);
  }, [setRail]);

  const widthValue = useMemo<SidebarWidthValue>(
    () => ({
      width: Math.min(chosenWidth, roomForSidebar),
      maxWidth: roomForSidebar,
      setWidth,
      resetWidth,
      setRail,
    }),
    [chosenWidth, roomForSidebar, setWidth, resetWidth, setRail]
  );

  const value = useMemo<SidebarValue>(
    () => ({
      wide,
      railOnly,
      openDrawer,
      drawerProgress,
      toggleCollapsed,
      serverOpen,
      openServer: (pairCode?: string) => {
        dismissDrawer();
        setServerPairCode(pairCode ?? null);
        setServerOpen(true);
      },
      serverPairCode,
      closeServer: () => setServerOpen(false),
      navSheet,
      // Closes the nav on the way, as the server sheet does: you have left it to
      // go make or edit something.
      openNavSheet: (sheet: NavSheet) => { dismissDrawer(); setNavSheet(sheet); },
      closeNavSheet: () => setNavSheet(null),
    }),
    [wide, railOnly, openDrawer, drawerProgress, dismissDrawer, toggleCollapsed, serverOpen, serverPairCode, navSheet]
  );

  const drawerState = useMemo<DrawerStateValue>(
    () => ({ drawerOpen, closeDrawer: dismissDrawer }),
    [drawerOpen, dismissDrawer]
  );

  return (
    <SidebarContext.Provider value={value}>
      <DrawerStateContext.Provider value={drawerState}>
        {/* A rail-only window shows the rail whatever the preference, which is kept for when it widens. */}
        <CollapsedContext.Provider value={collapsed || railOnly}>
          <SidebarWidthContext.Provider value={widthValue}>{children}</SidebarWidthContext.Provider>
        </CollapsedContext.Provider>
      </DrawerStateContext.Provider>
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
  return ctx;
}

/** Drawer visibility is isolated so opening it does not invalidate every screen. */
export function useDrawerState(): DrawerStateValue {
  const ctx = useContext(DrawerStateContext);
  if (!ctx) throw new Error('useDrawerState must be used within a SidebarProvider');
  return ctx;
}

/** Whether the pinned sidebar is a rail. Read only where that changes what is drawn. */
export function useSidebarCollapsed(): boolean {
  return useContext(CollapsedContext);
}

/** The pinned sidebar's width, and the means to drag it. See `SidebarWidthValue`. */
export function useSidebarWidth(): SidebarWidthValue {
  return useContext(SidebarWidthContext);
}

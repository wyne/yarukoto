import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Easing, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

/** Above this width the sidebar is pinned open and the bottom tab bar goes away. */
export const WIDE_BREAKPOINT = 900;

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
  wide: boolean;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
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
  /** Wide layouts only: the pinned sidebar shrinks to an icon rail. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Server sheet lives at the Layout level so it survives the drawer closing. */
  serverOpen: boolean;
  openServer: () => void;
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

const SidebarContext = createContext<SidebarValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [navSheet, setNavSheet] = useState<NavSheet | null>(null);
  const drawerProgress = useSharedValue(0);

  // The drawer is a narrow-layout affordance; going wide pins the sidebar instead.
  useEffect(() => {
    if (wide) setDrawerOpen(false);
  }, [wide]);

  const value = useMemo<SidebarValue>(
    () => ({
      wide,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      drawerProgress,
      collapsed,
      toggleCollapsed: () => setCollapsed((v) => !v),
      serverOpen,
      openServer: () => { setDrawerOpen(false); setServerOpen(true); },
      closeServer: () => setServerOpen(false),
      navSheet,
      // Closes the nav on the way, as the server sheet does: you have left it to
      // go make or edit something.
      openNavSheet: (sheet: NavSheet) => { setDrawerOpen(false); setNavSheet(sheet); },
      closeNavSheet: () => setNavSheet(null),
    }),
    [wide, drawerOpen, drawerProgress, collapsed, serverOpen, navSheet]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
  return ctx;
}

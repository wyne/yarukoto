import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

/** Above this width the sidebar is pinned open and the bottom tab bar goes away. */
export const WIDE_BREAKPOINT = 900;

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
    [wide, drawerOpen, collapsed, serverOpen, navSheet]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
  return ctx;
}

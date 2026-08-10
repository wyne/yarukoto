import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

/** Above this width the sidebar is pinned open and the bottom tab bar goes away. */
export const WIDE_BREAKPOINT = 900;

/** Caps the reading width of a screen's content on wide layouts. */
export const PANE_MAX_WIDTH = 900;

interface SidebarValue {
  wide: boolean;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const SidebarContext = createContext<SidebarValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    }),
    [wide, drawerOpen]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
  return ctx;
}

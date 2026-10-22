import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

interface DetailActions {
  openTask: (taskId: string) => void;
  closeTask: () => void;
}

interface DetailValue extends DetailActions {
  /** Task currently shown in the detail pane / sheet, or null when nothing is open. */
  openTaskId: string | null;
}

const DetailContext = createContext<DetailValue | null>(null);
/**
 * The two actions on their own. They never change, so a screen that only opens
 * tasks — the calendar, the activity log — isn't redrawn each time a different
 * one is opened, which with the pane up is every ↑ and ↓ in a list.
 */
const DetailActionsContext = createContext<DetailActions | null>(null);
/**
 * Whether the screen in front wants an open task over it rather than beside it.
 * Separate from the rest so that setting it, once per focus, redraws only the
 * layout that reads it.
 */
const OverlayContext = createContext<{ overlay: boolean; setOverlay: (on: boolean) => void } | null>(null);

/**
 * Which task is open is layout-independent: wide layouts render it as a third
 * column, narrow ones as a pull-up sheet. Both read the same state, so resizing
 * across the breakpoint keeps the task open.
 */
export function DetailProvider({ children }: { children: React.ReactNode }) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(false);
  const overlayValue = useMemo(() => ({ overlay, setOverlay }), [overlay]);

  const openTask = useCallback((taskId: string) => setOpenTaskId(taskId), []);
  const closeTask = useCallback(() => setOpenTaskId(null), []);

  const actions = useMemo<DetailActions>(() => ({ openTask, closeTask }), [openTask, closeTask]);
  const value = useMemo<DetailValue>(() => ({ openTaskId, ...actions }), [openTaskId, actions]);

  return (
    <OverlayContext.Provider value={overlayValue}>
      <DetailActionsContext.Provider value={actions}>
        <DetailContext.Provider value={value}>{children}</DetailContext.Provider>
      </DetailActionsContext.Provider>
    </OverlayContext.Provider>
  );
}

export function useDetail(): DetailValue {
  const ctx = useContext(DetailContext);
  if (!ctx) throw new Error('useDetail must be used within a DetailProvider');
  return ctx;
}

/** Opening and closing a task, for whatever doesn't show which one is open. */
export function useDetailActions(): DetailActions {
  const ctx = useContext(DetailActionsContext);
  if (!ctx) throw new Error('useDetailActions must be used within a DetailProvider');
  return ctx;
}

/** Whether an open task should slide over the screen in front instead of taking a column. */
export function useDetailOverlay(): boolean {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useDetailOverlay must be used within a DetailProvider');
  return ctx.overlay;
}

/**
 * Asks for an open task to come over this screen rather than beside it, while
 * the screen is in front. For a screen whose content is laid out to the width
 * it has, where a column arriving and leaving reflows everything on it.
 */
export function useOverlayDetailWhileFocused(): void {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useOverlayDetailWhileFocused must be used within a DetailProvider');
  const { setOverlay } = ctx;
  useFocusEffect(
    useCallback(() => {
      setOverlay(true);
      return () => setOverlay(false);
    }, [setOverlay])
  );
}

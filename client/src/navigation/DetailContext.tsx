import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

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
 * Which task is open is layout-independent: wide layouts render it as a third
 * column, narrow ones as a pull-up sheet. Both read the same state, so resizing
 * across the breakpoint keeps the task open.
 */
export function DetailProvider({ children }: { children: React.ReactNode }) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const openTask = useCallback((taskId: string) => setOpenTaskId(taskId), []);
  const closeTask = useCallback(() => setOpenTaskId(null), []);

  const actions = useMemo<DetailActions>(() => ({ openTask, closeTask }), [openTask, closeTask]);
  const value = useMemo<DetailValue>(() => ({ openTaskId, ...actions }), [openTaskId, actions]);

  return (
    <DetailActionsContext.Provider value={actions}>
      <DetailContext.Provider value={value}>{children}</DetailContext.Provider>
    </DetailActionsContext.Provider>
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

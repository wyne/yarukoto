import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface DetailValue {
  /** Task currently shown in the detail pane / sheet, or null when nothing is open. */
  openTaskId: string | null;
  openTask: (taskId: string) => void;
  closeTask: () => void;
}

const DetailContext = createContext<DetailValue | null>(null);

/**
 * Which task is open is layout-independent: wide layouts render it as a third
 * column, narrow ones as a pull-up sheet. Both read the same state, so resizing
 * across the breakpoint keeps the task open.
 */
export function DetailProvider({ children }: { children: React.ReactNode }) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const openTask = useCallback((taskId: string) => setOpenTaskId(taskId), []);
  const closeTask = useCallback(() => setOpenTaskId(null), []);

  const value = useMemo<DetailValue>(
    () => ({ openTaskId, openTask, closeTask }),
    [openTaskId, openTask, closeTask]
  );

  return <DetailContext.Provider value={value}>{children}</DetailContext.Provider>;
}

export function useDetail(): DetailValue {
  const ctx = useContext(DetailContext);
  if (!ctx) throw new Error('useDetail must be used within a DetailProvider');
  return ctx;
}

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface SelectionValue {
  /** Tasks picked out for a bulk edit. Empty when nothing is selected. */
  selectedIds: string[];
  /**
   * The last row clicked on its own, which a shift-click measures its range
   * from. Kept even while nothing is selected, so the first shift-click after a
   * plain one has somewhere to start.
   */
  anchorId: string | null;
  setAnchor: (taskId: string) => void;
  select: (taskIds: string[]) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionValue | null>(null);

/**
 * Which tasks are selected, held above the list because the bulk actions are not
 * rendered by it: a wide layout puts them in the column beside the list, where
 * the task detail otherwise sits.
 */
export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const setAnchor = useCallback((taskId: string) => setAnchorId(taskId), []);
  const select = useCallback((taskIds: string[]) => setSelectedIds(taskIds), []);
  const clear = useCallback(() => setSelectedIds([]), []);

  const value = useMemo<SelectionValue>(
    () => ({ selectedIds, anchorId, setAnchor, select, clear }),
    [selectedIds, anchorId, setAnchor, select, clear]
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within a SelectionProvider');
  return ctx;
}

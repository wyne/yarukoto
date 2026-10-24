import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface SelectedValue {
  /** Tasks picked out for a bulk edit. Empty when nothing is selected. */
  selectedIds: string[];
  select: (taskIds: string[]) => void;
  clear: () => void;
}

interface AnchorValue {
  /**
   * The last row clicked on its own, which a shift-click measures its range
   * from. Kept even while nothing is selected, so the first shift-click after a
   * plain one has somewhere to start.
   */
  anchorId: string | null;
  setAnchor: (taskId: string) => void;
  /**
   * Moves the anchor to `taskId` only if it is still `from`. For a default
   * cursor picked from what a render saw: anything that set the anchor since,
   * and hasn't drawn yet, is newer and keeps it.
   */
  replaceAnchor: (from: string | null, taskId: string) => void;
}

type SelectionValue = SelectedValue & AnchorValue;

/**
 * Two contexts, because the two halves change at very different rates. The
 * anchor is also the keyboard's cursor, so it moves on every ↑ and ↓; the
 * selection only changes when something is picked out. The layout, the tab bar
 * and the bulk actions read the selection alone, and one context would redraw
 * all of them — and the navigator under the layout — for each key press.
 */
const SelectedContext = createContext<SelectedValue | null>(null);
const AnchorContext = createContext<AnchorValue | null>(null);
/** Moving the cursor and clearing the selection, which never change; see `useSelectionActions`. */
const ActionsContext = createContext<SelectionActions | null>(null);

interface SelectionActions {
  setAnchor: (taskId: string) => void;
  clear: () => void;
}

/**
 * Which tasks are selected, held above the list because the bulk actions are not
 * rendered by it: a wide layout puts them in the column beside the list, where
 * the task detail otherwise sits.
 */
export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const setAnchor = useCallback((taskId: string) => setAnchorId(taskId), []);
  const replaceAnchor = useCallback(
    (from: string | null, taskId: string) => setAnchorId((current) => (current === from ? taskId : current)),
    []
  );
  const select = useCallback((taskIds: string[]) => setSelectedIds(taskIds), []);
  // Clearing nothing keeps the array it had: moving the cursor clears on every
  // key press, and a new empty array each time is a change to everyone reading it.
  const clear = useCallback(() => setSelectedIds((current) => (current.length > 0 ? [] : current)), []);

  const selected = useMemo<SelectedValue>(
    () => ({ selectedIds, select, clear }),
    [selectedIds, select, clear]
  );
  const anchor = useMemo<AnchorValue>(
    () => ({ anchorId, setAnchor, replaceAnchor }),
    [anchorId, setAnchor, replaceAnchor]
  );
  const actions = useMemo<SelectionActions>(() => ({ setAnchor, clear }), [setAnchor, clear]);

  return (
    <SelectedContext.Provider value={selected}>
      <AnchorContext.Provider value={anchor}>
        <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
      </AnchorContext.Provider>
    </SelectedContext.Provider>
  );
}

/** The selection without the anchor, for whatever doesn't draw the cursor. */
export function useSelectedIds(): SelectedValue {
  const ctx = useContext(SelectedContext);
  if (!ctx) throw new Error('useSelectedIds must be used within a SelectionProvider');
  return ctx;
}

/** The selection and the anchor. Only the task list, which draws both, wants this. */
export function useSelection(): SelectionValue {
  const selected = useSelectedIds();
  const anchor = useContext(AnchorContext);
  if (!anchor) throw new Error('useSelection must be used within a SelectionProvider');
  return useMemo(() => ({ ...selected, ...anchor }), [selected, anchor]);
}

/**
 * Putting the cursor on a task from outside the list — the command menu's Go to
 * Task… — without redrawing on every move of it, as reading the anchor would.
 */
export function useSelectionActions(): SelectionActions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useSelectionActions must be used within a SelectionProvider');
  return ctx;
}

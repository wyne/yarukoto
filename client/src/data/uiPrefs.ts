import { useCallback, useRef, useState } from 'react';
import { CollapsedSections, loadCollapsedSections, saveCollapsedSections } from './storage';
import { LATER_REPEATS_KEY } from './viewOptions';

/** A group that starts folded, so being listed means it was opened. */
const startsFolded = (groupKey: string) => groupKey === LATER_REPEATS_KEY;

export interface CollapsedController {
  isGroupCollapsed: (groupKey: string) => boolean;
  toggleGroup: (groupKey: string) => void;
  completedCollapsed: boolean;
  toggleCompleted: () => void;
  /** Grouping changed, so the old group keys no longer mean anything. */
  expandAllGroups: () => void;
  /** Folds or unfolds these groups together, as one saved change. */
  setGroupsCollapsed: (groupKeys: string[], collapsed: boolean) => void;
}

/**
 * Collapse state for the view identified by `viewKey`, restored from the device
 * and saved on every toggle.
 *
 * One screen instance hosts Inbox and every list- or tag-filtered view, so the
 * key changes underneath this hook rather than the component remounting — which
 * is also why the old behaviour leaked one view's folded sections into the next.
 */
export function useCollapsedSections(viewKey: string): CollapsedController {
  const [value, setValue] = useState<CollapsedSections>(() => loadCollapsedSections(viewKey));

  // Swap in the new view's saved state during this same render. React discards
  // this pass and re-renders with it, so the header never paints the wrong state.
  const keyRef = useRef(viewKey);
  if (keyRef.current !== viewKey) {
    keyRef.current = viewKey;
    setValue(loadCollapsedSections(viewKey));
  }

  const update = (next: CollapsedSections) => {
    setValue(next);
    saveCollapsedSections(viewKey, next);
  };

  // Kept until a group is actually folded or opened: the list builds its rows
  // from this, and a new function on every render rebuilt all of them each time.
  const groups = value.groups;
  const isGroupCollapsed = useCallback(
    (groupKey: string) => groups.includes(groupKey) !== startsFolded(groupKey),
    [groups]
  );

  return {
    isGroupCollapsed,
    toggleGroup: (groupKey) =>
      update({
        ...value,
        groups: value.groups.includes(groupKey)
          ? value.groups.filter((k) => k !== groupKey)
          : [...value.groups, groupKey],
      }),
    completedCollapsed: value.completed,
    toggleCompleted: () => update({ ...value, completed: !value.completed }),
    expandAllGroups: () => {
      // Every grouping has the same folded-repeats group, so it keeps its state.
      const next = value.groups.filter(startsFolded);
      if (next.length !== value.groups.length) update({ ...value, groups: next });
    },
    setGroupsCollapsed: (groupKeys, collapsed) => {
      const listed = (k: string) => collapsed !== startsFolded(k);
      const next = [
        ...value.groups.filter((k) => !groupKeys.includes(k) || listed(k)),
        ...groupKeys.filter((k) => listed(k) && !value.groups.includes(k)),
      ];
      if (next.length !== value.groups.length || next.some((k, i) => k !== value.groups[i])) {
        update({ ...value, groups: next });
      }
    },
  };
}

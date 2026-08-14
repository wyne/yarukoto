import { useRef, useState } from 'react';
import { CollapsedSections, loadCollapsedSections, saveCollapsedSections } from './storage';

export interface CollapsedController {
  isGroupCollapsed: (groupKey: string) => boolean;
  toggleGroup: (groupKey: string) => void;
  completedCollapsed: boolean;
  toggleCompleted: () => void;
  /** Grouping changed, so the old group keys no longer mean anything. */
  expandAllGroups: () => void;
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

  return {
    isGroupCollapsed: (groupKey) => value.groups.includes(groupKey),
    toggleGroup: (groupKey) =>
      update({
        ...value,
        groups: value.groups.includes(groupKey)
          ? value.groups.filter((k) => k !== groupKey)
          : [...value.groups, groupKey],
      }),
    completedCollapsed: value.completed,
    toggleCompleted: () => update({ ...value, completed: !value.completed }),
    expandAllGroups: () => update({ ...value, groups: [] }),
  };
}

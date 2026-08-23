import { FolderDef, ListDef } from '../../data/types';
import { activeFolders, compareOrder, listsInFolder } from '../../data/selectors';

/**
 * The nav's tree, flattened into one sequence of rows.
 *
 * The nav is one tree, two levels deep: the root holds folders and loose lists
 * side by side, and a folder holds lists. Folders and root lists are siblings —
 * a list can sit above one folder and below another — which is why a root
 * list's `order` and a folder's are values in the same space.
 *
 * It is flattened because react-native-sortables reorders a flat set of
 * siblings and cannot hand an item from one container to another. A sortable
 * per folder would leave a list dragged towards a different folder with no slot
 * opening for it, which is the whole affordance. So the tree goes in flat and
 * `resolveDrop` reads the meaning back out of where a row landed.
 *
 * Everything here is pure and total, which is deliberate: it is all index
 * arithmetic, much easier to reason about away from React.
 */
export type NavRow =
  | { kind: 'folder'; key: string; folder: FolderDef; depth: 0 }
  | { kind: 'list'; key: string; list: ListDef; depth: 0 | 1 };

/**
 * Prefixed so a folder and a list can never collide, which matters twice: the
 * two id spaces are independent, and DragList keys its children by these.
 */
export const folderKey = (id: string): string => `f:${id}`;
export const listKey = (id: string): string => `l:${id}`;

/** The row's parent: a folder id, or null for a row at the root. */
export function parentOf(row: NavRow): string | null {
  return row.kind === 'folder' ? null : row.list.folderId;
}

/** The row's own id, whichever kind it is. */
export function idOf(row: NavRow): string {
  return row.kind === 'folder' ? row.folder.id : row.list.id;
}

interface FlattenOptions {
  /** Folders whose children are hidden — the ones the user has collapsed. */
  collapsed?: readonly string[];
}

export function flattenTree(
  folders: FolderDef[],
  lists: ListDef[],
  { collapsed = [] }: FlattenOptions = {}
): NavRow[] {
  // Folders and root lists interleave, so the root is one merged sequence
  // ordered by the position they share.
  const root = [
    ...activeFolders(folders).map(
      (folder): NavRow => ({ kind: 'folder', key: folderKey(folder.id), folder, depth: 0 })
    ),
    ...listsInFolder(lists, null).map(
      (list): NavRow => ({ kind: 'list', key: listKey(list.id), list, depth: 0 })
    ),
  ]
    // Sorted by the same rule the selectors use, tie-break included — ids never
    // change, so no edit can reshuffle the nav.
    .map((row) => ({ row, id: idOf(row), order: row.kind === 'folder' ? row.folder.order : row.list.order }))
    .sort(compareOrder)
    .map((e) => e.row);

  const rows: NavRow[] = [];
  for (const row of root) {
    rows.push(row);
    if (row.kind !== 'folder') continue;
    if (collapsed.includes(row.folder.id)) continue;
    for (const list of listsInFolder(lists, row.folder.id)) {
      rows.push({ kind: 'list', key: listKey(list.id), list, depth: 1 });
    }
  }
  return rows;
}

/**
 * Where a dropped row landed: which parent it now belongs to, and the siblings
 * it fell between.
 *
 * `intent` is the depth the finger asked for — 0 for the root, 1 for inside the
 * folder above. It exists because vertical position alone is ambiguous once
 * lists may live at the root: the slot just below a folder's last child is both
 * "another child of that folder" and "a root list following it". Reading depth
 * from sideways travel is how the tree apps resolve this, and it is the only
 * way a nested list can be dragged back out to the root.
 *
 * Once the parent is known the siblings follow from a single rule — the nearest
 * row above and below sharing that parent — which is uniform across all three
 * cases: a folder (always root), a root list, and a list inside a folder.
 */
export function resolveDrop(
  next: NavRow[],
  key: string,
  intent: 0 | 1
): { parentId: string | null; prevId: string | null; nextId: string | null } | null {
  const i = next.findIndex((r) => r.key === key);
  if (i < 0) return null;
  const moved = next[i];

  // Folders do not nest, so their parent is never in question.
  let parentId: string | null = null;
  if (moved.kind === 'list' && intent === 1) {
    for (let j = i - 1; j >= 0; j--) {
      const row = next[j];
      if (row.kind === 'folder') {
        parentId = row.folder.id;
        break;
      }
      // A row already inside a folder names that folder just as well, and
      // reaches it when the drop is below a child rather than the header.
      const p = parentOf(row);
      if (p !== null) {
        parentId = p;
        break;
      }
    }
    // Asked to nest with no folder above it — there is nothing to nest into, so
    // it stays at the root rather than being refused.
  }

  const sibling = (from: number, step: number): string | null => {
    for (let j = from; j >= 0 && j < next.length; j += step) {
      const row = next[j];
      if (row.key === key) continue;
      if (parentOf(row) === parentId) return idOf(row);
      // A folder ends the run of its own children, so scanning past it while
      // looking for a child of some *other* folder would cross into a different
      // parent's rows.
      if (parentId !== null && row.kind === 'folder') return null;
    }
    return null;
  };

  return { parentId, prevId: sibling(i - 1, -1), nextId: sibling(i + 1, 1) };
}

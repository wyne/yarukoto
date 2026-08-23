/**
 * Fractional indexing: where a dragged row's new `order` comes from.
 *
 * Lifted out of TaskContext when lists and folders became reorderable too.
 * Deliberately generalised rather than copied — it is a numeric algorithm with
 * a precision escape hatch, there is no test suite to catch two copies drifting
 * apart, and the container case needs a *scoped* variant that a copy-paste
 * would get subtly wrong (see `scope` below).
 */

/** Anything with a manual position: a task, a list, a folder. */
export interface Ordered {
  id: string;
  order: number;
}

/**
 * Positions are midpoints, and halving the same gap repeatedly does eventually
 * exhaust a float. This is where that stops being safe.
 */
const ORDER_EPSILON = 1e-6;

/**
 * Moves rows between two neighbours.
 *
 * `rows` is the whole collection to rebuild; `scope` is the peer set sharing one
 * ordering space. They are the same array for tasks and folders, which rank
 * globally. For lists they differ: a list's order is scoped to its folder, so
 * `scope` is that folder's lists and `rows` is every list there is. Passing
 * `rows` where `scope` belongs would let a renumber renumber other folders too.
 *
 * Taking the midpoint of the neighbours touches exactly one record, so a drag
 * no longer renumbers everything around it.
 *
 * Rows that don't move are returned by reference. That is load-bearing: the
 * reducer stamps `updatedAt` on any row whose identity changed, so returning
 * the same object is how this says "nothing happened to you".
 */
export function reorderRows<T extends Ordered>(
  rows: T[],
  scope: Ordered[],
  ids: string[],
  prevId: string | null,
  nextId: string | null
): T[] {
  return applyOrders(rows, computeOrders(scope, ids, prevId, nextId));
}

/**
 * Writes an orders map onto a collection, leaving rows it doesn't mention — and
 * rows whose value is unchanged — by reference.
 *
 * Separate from `computeOrders` because one ordering space can span two
 * collections. Folders and the lists that sit at the root are siblings in the
 * nav, so a drag there has to place a list among folders; the orders are worked
 * out once over the merged scope and then applied to each array in turn.
 */
export function applyOrders<T extends Ordered>(rows: T[], orders: Map<string, number>): T[] {
  // The array itself is returned untouched when there is nothing to write, not
  // just its rows: plenty of `useMemo`s downstream are keyed on the collection,
  // and a fresh array for a drag that changed nothing would re-run all of them.
  if (orders.size === 0) return rows;
  let changed = false;
  const next = rows.map((r) => {
    const order = orders.get(r.id);
    if (order === undefined || order === r.order) return r;
    changed = true;
    return { ...r, order };
  });
  return changed ? next : rows;
}

/**
 * The new positions for `ids`, dropped between two neighbours of `scope`.
 *
 * Every moving id must itself be in `scope` — that is what makes the midpoint
 * meaningful, and for a cross-container move it means relocating the row before
 * asking, so it is already among the peers it is being placed against.
 */
export function computeOrders(
  scope: Ordered[],
  ids: string[],
  prevId: string | null,
  nextId: string | null
): Map<string, number> {
  // Usually one row, and several when a selection is dragged as a group. They
  // share the gap between the neighbours, spread evenly so they keep the order
  // they were in.
  const moving = ids.filter((id) => scope.some((r) => r.id === id));
  if (moving.length === 0) return new Map();
  const prev = prevId ? scope.find((r) => r.id === prevId) : undefined;
  const next = nextId ? scope.find((r) => r.id === nextId) : undefined;

  let start: number;
  let step: number;
  if (prev && next) {
    const gap = next.order - prev.order;
    // Room for one midpoint per moved row, or there is nothing left to split.
    if (gap < ORDER_EPSILON * (moving.length + 1)) return renumberOrders(scope, moving, prevId);
    step = gap / (moving.length + 1);
    start = prev.order + step;
  } else if (prev) {
    start = prev.order + 1;
    step = 1;
  } else if (next) {
    start = next.order - moving.length;
    step = 1;
  } else {
    // Neither neighbour: the row is alone where it landed — a list dragged into
    // an empty folder, say — and still needs a defined position.
    return new Map(moving.map((id, i) => [id, i]));
  }

  return new Map(moving.map((id, i) => [id, start + i * step]));
}

/**
 * The precision escape hatch. Respaces the whole scope by whole numbers in its
 * current order, dropping the moved rows in directly after their new
 * predecessor, which reopens room to subdivide. Returns a position for every row
 * in scope, so it only runs when the midpoint above has nowhere left to go.
 */
export function renumberOrders(
  scope: Ordered[],
  ids: string[],
  prevId: string | null
): Map<string, number> {
  const moving = new Set(ids);
  const rest = [...scope].sort((a, b) => a.order - b.order).filter((r) => !moving.has(r.id));
  const moved = ids.map((id) => scope.find((r) => r.id === id)!);
  const at = prevId ? rest.findIndex((r) => r.id === prevId) + 1 : 0;
  const sequence = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
  return new Map(sequence.map((r, i) => [r.id, i]));
}

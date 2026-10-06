import { applyOrders, changedOrders, computeOrders, reorderRows, renumberOrders } from '../src/data/ordering';

describe('fractional ordering', () => {
  test('places a row midway between its new neighbours', () => {
    const rows = [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
    ];

    expect(computeOrders(rows, ['c'], 'a', 'b')).toEqual(new Map([['c', 0.5]]));
  });

  test('respaces the smallest local window when a gap is too small to subdivide', () => {
    const rows = [
      { id: 'a', order: 0 },
      { id: 'b', order: 0.0000005 },
      { id: 'c', order: 1 },
    ];

    expect(computeOrders(rows, ['c'], 'a', 'b')).toEqual(
      new Map([
        ['c', 1],
        ['b', 2],
      ])
    );
  });

  test('leaves rows outside the local precision window untouched', () => {
    const rows = [
      { id: 'left', order: -10 },
      { id: 'a', order: 0 },
      { id: 'b', order: 0.0000005 },
      { id: 'c', order: 0.5 },
      { id: 'd', order: 1 },
      { id: 'right', order: 10 },
    ];

    const orders = computeOrders(rows, ['d'], 'a', 'b');
    const changed = changedOrders(rows, orders);
    const applied = applyOrders(rows, changed);

    expect([...changed.keys()]).toEqual(['d', 'b']);
    expect(applied.find((row) => row.id === 'left')).toBe(rows[0]);
    expect(applied.find((row) => row.id === 'a')).toBe(rows[1]);
    expect(applied.find((row) => row.id === 'c')).toBe(rows[3]);
    expect(applied.find((row) => row.id === 'right')).toBe(rows[5]);
    expect([...applied].sort((x, y) => x.order - y.order).map((row) => row.id)).toEqual([
      'left',
      'a',
      'd',
      'b',
      'c',
      'right',
    ]);
  });

  test('preserves collection and row identity when no value changes', () => {
    const rows = [{ id: 'a', order: 0 }];

    expect(applyOrders(rows, new Map())).toBe(rows);
    expect(applyOrders(rows, new Map([['a', 0]]))).toBe(rows);
  });

  test('places several rows before, after, or without neighbours', () => {
    const rows = [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
    ];
    expect(computeOrders(rows, ['b', 'c'], null, 'a')).toEqual(new Map([['b', -2], ['c', -1]]));
    expect(computeOrders(rows, ['b'], 'c', null)).toEqual(new Map([['b', 3]]));
    expect(computeOrders(rows, ['b', 'missing'], null, null)).toEqual(new Map([['b', 0]]));
    expect(computeOrders(rows, ['missing'], null, null)).toEqual(new Map());
  });

  test('renumbers moved rows after the requested predecessor', () => {
    const rows = [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
      { id: 'd', order: 3 },
    ];
    const respaced = renumberOrders(rows, ['a', 'd'], 'b');
    expect([...respaced.keys()]).toEqual(['a', 'd']);
    expect(respaced.get('a')).toBeCloseTo(4 / 3);
    expect(respaced.get('d')).toBeCloseTo(5 / 3);
    expect(reorderRows(rows, rows, ['d'], 'a', 'b').find((row) => row.id === 'd')?.order).toBe(0.5);
  });

  test('keeps multi-row moves ordered while bounding the respace', () => {
    const rows = [
      { id: 'left', order: -1 },
      { id: 'a', order: 0 },
      { id: 'b', order: 0.000001 },
      { id: 'c', order: 1 },
      { id: 'x', order: 10 },
      { id: 'y', order: 11 },
      { id: 'right', order: 20 },
    ];

    const changed = changedOrders(rows, computeOrders(rows, ['x', 'y'], 'a', 'b'));
    const applied = applyOrders(rows, changed);

    expect(changed.has('left')).toBe(false);
    expect(changed.has('c')).toBe(false);
    expect(changed.has('right')).toBe(false);
    expect([...applied].sort((x, y) => x.order - y.order).map((row) => row.id)).toEqual([
      'left',
      'a',
      'x',
      'y',
      'b',
      'c',
      'right',
    ]);
  });

  test('preserves the requested sequence for a precision collision anywhere in the scope', () => {
    for (let size = 3; size <= 20; size += 1) {
      for (let gap = 0; gap < size - 1; gap += 1) {
        const peers = Array.from({ length: size }, (_, index) => ({
          id: `peer-${index}`,
          order: index === gap + 1 ? gap + 0.0000005 : index,
        }));
        const moving = { id: 'moving', order: size + 10 };
        const rows = [...peers, moving];
        const orders = computeOrders(rows, [moving.id], peers[gap].id, peers[gap + 1].id);
        const applied = applyOrders(rows, changedOrders(rows, orders));
        const expected = [
          ...peers.slice(0, gap + 1).map((row) => row.id),
          moving.id,
          ...peers.slice(gap + 1).map((row) => row.id),
        ];

        expect([...applied].sort((a, b) => a.order - b.order).map((row) => row.id)).toEqual(expected);
      }
    }
  });

  test('repeated inserts recover headroom without spreading to distant rows', () => {
    const base = -1_760_000_000_000;
    const left = { id: 'left', order: base - 1_000_000 };
    const anchor = { id: 'anchor', order: base };
    const right = { id: 'right', order: base + 1_000_000 };
    let rows = [left, anchor, right];
    let nextId = right.id;
    let widestChange = 0;
    let insertsSinceRespace = 0;
    let sawRespace = false;

    for (let index = 0; index < 200; index += 1) {
      const inserted = { id: `inserted-${index}`, order: base + 1000 + index };
      rows = [...rows, inserted];
      const changed = changedOrders(rows, computeOrders(rows, [inserted.id], anchor.id, nextId));
      widestChange = Math.max(widestChange, changed.size);
      if (changed.size > 1) {
        if (sawRespace) expect(insertsSinceRespace).toBeGreaterThanOrEqual(10);
        sawRespace = true;
        insertsSinceRespace = 0;
      } else if (sawRespace) {
        insertsSinceRespace += 1;
      }
      expect(changed.has(left.id)).toBe(false);
      expect(changed.has(right.id)).toBe(false);
      rows = applyOrders(rows, changed);
      nextId = inserted.id;

      const ordered = [...rows].sort((a, b) => a.order - b.order);
      expect(ordered[0].id).toBe(left.id);
      expect(ordered[1].id).toBe(anchor.id);
      expect(ordered[2].id).toBe(inserted.id);
      expect(new Set(ordered.map((row) => row.order)).size).toBe(ordered.length);
    }

    expect(widestChange).toBeLessThanOrEqual(3);
    expect(sawRespace).toBe(true);
    expect(rows.find((row) => row.id === left.id)).toBe(left);
    expect(rows.find((row) => row.id === right.id)).toBe(right);
  });

  test('falls back when a large-magnitude midpoint rounds onto a neighbour', () => {
    const base = -1_760_000_000_000;
    const ulp = 2 ** (Math.floor(Math.log2(Math.abs(base))) - 52);
    const rows = [
      { id: 'outer-left', order: base - 1000 },
      { id: 'prev', order: base },
      { id: 'next', order: base + ulp },
      { id: 'outer-right', order: base + 1000 },
      { id: 'moving', order: base + 2000 },
    ];

    const changed = changedOrders(rows, computeOrders(rows, ['moving'], 'prev', 'next'));
    const applied = applyOrders(rows, changed);

    expect(changed.size).toBeGreaterThan(1);
    expect(new Set(applied.map((row) => row.order)).size).toBe(applied.length);
    expect([...applied].sort((a, b) => a.order - b.order).map((row) => row.id)).toEqual([
      'outer-left',
      'prev',
      'moving',
      'next',
      'outer-right',
    ]);
  });
});

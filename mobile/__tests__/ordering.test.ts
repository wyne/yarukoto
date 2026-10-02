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

  test('renumbers the scope when a gap is too small to subdivide', () => {
    const rows = [
      { id: 'a', order: 0 },
      { id: 'b', order: 0.0000005 },
      { id: 'c', order: 1 },
    ];

    expect(computeOrders(rows, ['c'], 'a', 'b')).toEqual(
      new Map([
        ['a', 0],
        ['c', 1],
        ['b', 2],
      ])
    );
  });

  test('reports every row changed by a precision renumber', () => {
    const rows = [
      { id: 'a', order: 0 },
      { id: 'b', order: 0.0000005 },
      { id: 'c', order: 0.5 },
      { id: 'd', order: 1 },
    ];

    const orders = computeOrders(rows, ['d'], 'a', 'b');

    // The dragged row happens to keep the same numeric position. Two peers are
    // respaced, including c outside the old moved/previous/next dirty set.
    expect(changedOrders(rows, orders)).toEqual(
      new Map([
        ['b', 2],
        ['c', 3],
      ])
    );
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
    expect(renumberOrders(rows, ['a', 'd'], 'b')).toEqual(new Map([
      ['b', 0],
      ['a', 1],
      ['d', 2],
      ['c', 3],
    ]));
    expect(reorderRows(rows, rows, ['d'], 'a', 'b').find((row) => row.id === 'd')?.order).toBe(0.5);
  });
});

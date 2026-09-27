import { applyOrders, computeOrders } from '../src/data/ordering';

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

  test('preserves collection and row identity when no value changes', () => {
    const rows = [{ id: 'a', order: 0 }];

    expect(applyOrders(rows, new Map())).toBe(rows);
    expect(applyOrders(rows, new Map([['a', 0]]))).toBe(rows);
  });
});

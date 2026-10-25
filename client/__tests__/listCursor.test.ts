import { groupStop, listStops, rangeBetween, stepCursor, stepStop } from '../src/data/listCursor';

const ids = ['a', 'b', 'c', 'd'];

describe('stepCursor', () => {
  test('moves one row, and stops at either end', () => {
    expect(stepCursor(ids, 'b', 1)).toBe('c');
    expect(stepCursor(ids, 'b', -1)).toBe('a');
    expect(stepCursor(ids, 'd', 1)).toBe('d');
    expect(stepCursor(ids, 'a', -1)).toBe('a');
  });

  test('starts from the top going down and the bottom going up', () => {
    expect(stepCursor(ids, null, 1)).toBe('a');
    expect(stepCursor(ids, null, -1)).toBe('d');
    // A cursor on a row that has left the view counts as none.
    expect(stepCursor(ids, 'gone', 1)).toBe('a');
  });

  test('has nowhere to go in an empty list', () => {
    expect(stepCursor([], 'a', 1)).toBeNull();
  });
});

describe('rangeBetween', () => {
  test('spans either direction', () => {
    expect(rangeBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
    expect(rangeBetween(ids, 'c', 'c')).toEqual(['c']);
  });

  test('is empty when an end is missing', () => {
    expect(rangeBetween(ids, 'a', 'gone')).toEqual([]);
  });
});

describe('listStops', () => {
  const groups = [
    { key: 'A', tasks: [{ id: 'a1' }, { id: 'a2' }] },
    { key: 'B', tasks: [{ id: 'b1' }] },
    { key: 'E', tasks: [] },
    { key: 'C', tasks: [{ id: 'c1' }, { id: 'a1' }] },
  ];

  test('stands a folded group in for its tasks, and skips empty ones and repeats', () => {
    expect(listStops(groups, (k) => k === 'B')).toEqual([
      { taskId: 'a1', groupKey: 'A' },
      { taskId: 'a2', groupKey: 'A' },
      { taskId: null, groupKey: 'B' },
      { taskId: 'c1', groupKey: 'C' },
    ]);
  });

  test('steps like the cursor', () => {
    const stops = listStops(groups, () => false);
    expect(stepStop(stops, 1, 1)).toBe(2);
    expect(stepStop(stops, 3, 5)).toBe(3);
    expect(stepStop(stops, -1, 1)).toBe(0);
    expect(stepStop(stops, -1, -1)).toBe(3);
    expect(stepStop([], 0, 1)).toBe(-1);
  });

  test('moves between groups as vim does between paragraphs', () => {
    // a1 a2 | b1 | c1
    const stops = listStops(groups, () => false);
    expect(groupStop(stops, 0, 1)).toBe(2);
    expect(groupStop(stops, 2, 1)).toBe(3);
    // From the last group, to the very end.
    expect(groupStop(stops, 3, 1)).toBe(3);
    // Back to the start of this group, then to the one before.
    expect(groupStop(stops, 1, -1)).toBe(0);
    expect(groupStop(stops, 2, -1)).toBe(0);
    expect(groupStop(stops, 0, -1)).toBe(0);
    expect(groupStop(stops, -1, 1)).toBe(0);
    expect(groupStop(stops, -1, -1)).toBe(3);
  });
});

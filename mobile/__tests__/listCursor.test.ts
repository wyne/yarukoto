import { rangeBetween, stepCursor } from '../src/data/listCursor';

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

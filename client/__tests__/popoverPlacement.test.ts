import { placePopover } from '../src/components/popoverPlacement';

const bounds = { width: 1000, height: 700 };
const point = (x: number, y: number) => ({ x, y, width: 0, height: 0 });
const inside = (p: { left: number; top: number }, width: number, height: number) =>
  p.left >= 0 && p.top >= 0 && p.left + width <= bounds.width && p.top + height <= bounds.height;

describe('placePopover', () => {
  it('opens below and to the right of the pointer when there is room', () => {
    expect(placePopover({ anchor: point(100, 100), width: 292, height: 380, bounds, align: 'start' })).toEqual({
      left: 100,
      top: 108,
    });
  });

  it('opens upward when a tall menu would run off the bottom', () => {
    // 260px below the pointer is more than the old fixed threshold, so this is
    // the case that used to open downward and lose its last rows.
    const p = placePopover({ anchor: point(100, 440), width: 292, height: 380, bounds, align: 'start' });
    expect(p.top).toBe(440 - 8 - 380);
    expect(inside(p, 292, 380)).toBe(true);
  });

  it('opens leftward when it would run off the right', () => {
    const p = placePopover({ anchor: point(900, 100), width: 292, height: 380, bounds, align: 'start' });
    expect(p.left).toBe(900 - 292);
  });

  it('slides up to fit when there is room neither above nor below', () => {
    const p = placePopover({ anchor: point(100, 300), width: 292, height: 500, bounds, align: 'start' });
    expect(p.top + 500).toBe(bounds.height - 12);
    expect(inside(p, 292, 500)).toBe(true);
  });

  it('keeps the top on screen when the panel is taller than the window', () => {
    const p = placePopover({ anchor: point(100, 300), width: 292, height: 900, bounds, align: 'start' });
    expect(p.top).toBe(12);
  });

  it('hangs an end-aligned panel under its button', () => {
    const p = placePopover({
      anchor: { x: 800, y: 20, width: 40, height: 30 },
      width: 380,
      height: 300,
      bounds,
      align: 'end',
    });
    expect(p).toEqual({ left: 840 - 380, top: 58 });
  });
});

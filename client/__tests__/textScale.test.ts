jest.mock('../src/components/useWindowSelector', () => ({ useWindowSelector: () => 1 }));

import { TEXT_SCALES, clampTextScale, scaleTextStyles, stepTextScale } from '../src/theme/textScale';

test('steps through the sizes and stops at either end', () => {
  expect(stepTextScale(1, 1)).toBe(1.15);
  expect(stepTextScale(1, -1)).toBe(0.85);
  expect(stepTextScale(TEXT_SCALES[TEXT_SCALES.length - 1], 1)).toBe(TEXT_SCALES[TEXT_SCALES.length - 1]);
  expect(stepTextScale(TEXT_SCALES[0], -1)).toBe(TEXT_SCALES[0]);
});

test('a scale between steps moves to the next step the asked-for way', () => {
  expect(stepTextScale(1.2, 1)).toBe(1.3);
  expect(stepTextScale(1.2, -1)).toBe(1.15);
});

test('a stored scale is held to the range', () => {
  expect(clampTextScale(5)).toBe(TEXT_SCALES[TEXT_SCALES.length - 1]);
  expect(clampTextScale(0.1)).toBe(TEXT_SCALES[0]);
  expect(clampTextScale(1.3)).toBe(1.3);
});

test('scales type and leaves the rest of a style alone', () => {
  const styles = { title: { fontSize: 16, lineHeight: 20, padding: 8, height: 30 }, rule: { height: 1 } };
  expect(scaleTextStyles(styles, 1.5)).toEqual({
    title: { fontSize: 24, lineHeight: 30, padding: 8, height: 30 },
    rule: { height: 1 },
  });
  expect(scaleTextStyles(styles, 1)).toBe(styles);
});

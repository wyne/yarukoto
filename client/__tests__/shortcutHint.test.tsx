import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

let mockShown = true;
let mockAvailable = new Set<string>(['goAll']);

jest.mock('../src/data/platform', () => ({ MAC: true, MAC_KEYS: true }));
jest.mock('../src/theme/styles', () => ({
  makeStyles: (build: (colors: { inverseSurface: string; inverseText: string }) => unknown) => () =>
    build({ inverseSurface: '#000', inverseText: '#fff' }),
}));
jest.mock('../src/navigation/MenuCommands', () => ({
  useAvailableCommands: () => mockAvailable,
}));
jest.mock('../src/navigation/shortcutHints', () => ({
  useShortcutHintsShown: () => mockShown,
}));

import ShortcutHint from '../src/components/ShortcutHint';

function renderHint(compact = false) {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<ShortcutHint command="goAll" compact={compact} />);
  });
  return root;
}

beforeEach(() => {
  mockShown = true;
  mockAvailable = new Set(['goAll']);
});

test('keeps the command modifier in a full shortcut hint', () => {
  const root = renderHint();
  expect(root.root.findByType(Text).props.children).toBe('⌘1');
});

test('omits the already-held command modifier in a compact icon hint', () => {
  const root = renderHint(true);
  expect(root.root.findByType(Text).props.children).toBe('1');
});

test('stays hidden when its command is unavailable', () => {
  mockAvailable.clear();
  expect(renderHint().toJSON()).toBeNull();
});

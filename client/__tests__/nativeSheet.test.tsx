import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import NativeSheet from '../src/components/NativeSheet';

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');

  return {
    BottomSheetBackdrop: () => null,
    BottomSheetHandle: ({ children }: { children?: import('react').ReactNode }) =>
      React.createElement(View, null, children),
    BottomSheetModal: React.forwardRef<unknown, { children?: import('react').ReactNode }>(
      ({ children }, _ref) => React.createElement(View, { testID: 'bottom-sheet-modal' }, children)
    ),
    BottomSheetScrollView: ({ children }: { children?: import('react').ReactNode }) =>
      React.createElement(View, null, children),
    BottomSheetView: ({ children }: { children?: import('react').ReactNode }) =>
      React.createElement(View, { testID: 'bottom-sheet-view' }, children),
  };
});

jest.mock('../src/components/SheetHeader', () => () => null);
jest.mock('../src/components/useSheetInsets', () => ({
  useSheetBottomPadding: () => 0,
}));
jest.mock('../src/theme/ThemeContext', () => ({
  useColors: () => ({ scrimOpacity: 0.5 }),
  useScheme: () => 'light',
}));

function renderSheet(snapPoints?: string[]) {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(
      <NativeSheet visible={false} onClose={() => undefined} snapPoints={snapPoints}>
        <Text>Body</Text>
      </NativeSheet>
    );
  });
  return renderer!;
}

describe('NativeSheet body layout', () => {
  it('uses a regular flex container for a fixed-detent sheet', () => {
    const sheet = renderSheet(['92%']);

    expect(sheet.root.findAllByProps({ testID: 'bottom-sheet-view' })).toHaveLength(0);
    expect(
      sheet.root.findAll((node) => StyleSheet.flatten(node.props.style)?.flex === 1).length
    ).toBeGreaterThan(0);
  });

  it('keeps BottomSheetView for a dynamically-sized sheet', () => {
    const sheet = renderSheet();

    expect(sheet.root.findAllByProps({ testID: 'bottom-sheet-view' }).length).toBeGreaterThan(0);
  });
});

import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Platform, TextInput } from 'react-native';
import NativeOwnedTextInput from '../src/components/NativeOwnedTextInput';

jest.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetTextInput: () => null,
  useBottomSheetInternal: () => null,
}));
jest.mock('../src/theme/ThemeContext', () => ({
  useScheme: () => 'light',
}));

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = React.useState(initial);
  return <NativeOwnedTextInput multiline value={value} onChangeText={setValue} />;
}

function render(initial: string) {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(<Harness initial={initial} />);
  });
  const input = () => renderer!.root.findByType(TextInput);
  const type = (text: string) => act(() => input().props.onChangeText(text));
  return { input, type };
}

describe('NativeOwnedTextInput on native', () => {
  const originalOS = Platform.OS;
  beforeAll(() => {
    Platform.OS = 'ios';
  });
  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('hands native the first text typed into a field that opened empty, once', () => {
    const { input, type } = render('');
    expect(input().props.defaultValue).toBe('');
    expect(input().props.value).toBeUndefined();

    type('N');
    expect(input().props.defaultValue).toBe('N');

    type('No');
    type('Notes\nthat run on');
    expect(input().props.defaultValue).toBe('N');
    expect(input().props.value).toBeUndefined();
  });

  it('leaves a field that opened with text on its opening value', () => {
    const { input, type } = render('Existing');
    type('Existing notes');
    type('');
    type('x');
    expect(input().props.defaultValue).toBe('Existing');
  });
});

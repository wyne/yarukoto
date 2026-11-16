import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Platform, TextInput } from 'react-native';
import NativeOwnedTextInput from '../src/components/NativeOwnedTextInput';

// The real field rather than the preset's stand-in: the event count it keeps,
// and passes to native beside the text, is what the hand-over has to match.
jest.unmock('react-native/Libraries/Components/TextInput/TextInput');
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
  return { renderer: renderer!, input, type };
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

  it('hands over the text that goes with the newest event when keystrokes outrun a render', () => {
    const { renderer } = render('');
    // The host field React Native renders: the one carrying the event count.
    const host = () =>
      renderer.root.findAll(
        (node) => typeof node.type === 'string' && node.props.mostRecentEventCount !== undefined
      )[0];
    const change = (text: string, eventCount: number) =>
      host().props.onChange({ nativeEvent: { text, eventCount, target: 1 } });

    act(() => {
      change('N', 1);
      change('No', 2);
    });
    expect(host().props.mostRecentEventCount).toBe(2);
    expect(host().props.text).toBe('No');

    act(() => change('Not', 3));
    expect(host().props.text).toBe('No');
  });

  it('leaves a field that opened with text on its opening value', () => {
    const { input, type } = render('Existing');
    type('Existing notes');
    type('');
    type('x');
    expect(input().props.defaultValue).toBe('Existing');
  });
});

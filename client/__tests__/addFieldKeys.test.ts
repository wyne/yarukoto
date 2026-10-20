import { addFieldKey } from '../src/data/addFieldKeys';

const typed = (text: string, suggestionCount = 0, selectedIndex = -1) => ({ text, suggestionCount, selectedIndex });

describe('the add field keys', () => {
  test('Tab completes the token being typed, to the highlighted suggestion or the first', () => {
    expect(addFieldKey('tab', typed('pay ~ad', 3))).toEqual({ kind: 'complete', index: 0 });
    expect(addFieldKey('tab', typed('pay ~ad', 3, 2))).toEqual({ kind: 'complete', index: 2 });
  });

  test('Tab moves on round the panes only from an empty field', () => {
    expect(addFieldKey('tab', typed(''))).toEqual({ kind: 'leave', delta: 1 });
    expect(addFieldKey('tab', typed('   '))).toEqual({ kind: 'leave', delta: 1 });
    expect(addFieldKey('shift+tab', typed(''))).toEqual({ kind: 'leave', delta: -1 });
  });

  test('with text and nothing to complete, Tab and Shift-Tab stay put', () => {
    expect(addFieldKey('tab', typed('pay rent'))).toEqual({ kind: 'swallow' });
    expect(addFieldKey('shift+tab', typed('pay rent'))).toEqual({ kind: 'swallow' });
    expect(addFieldKey('shift+tab', typed('pay ~ad', 3))).toEqual({ kind: 'swallow' });
  });

  test('↓ walks the suggestions, goes to the list from an empty field, and is the caret’s otherwise', () => {
    expect(addFieldKey('down', typed('pay ~ad', 3))).toEqual({ kind: 'highlight', delta: 1 });
    expect(addFieldKey('down', typed(''))).toEqual({ kind: 'toList' });
    expect(addFieldKey('down', typed('pay rent'))).toEqual({ kind: 'pass' });
    expect(addFieldKey('up', typed('pay ~ad', 3))).toEqual({ kind: 'highlight', delta: -1 });
    expect(addFieldKey('up', typed('pay rent'))).toEqual({ kind: 'pass' });
  });

  test('Escape always leaves for the list, draft or not', () => {
    expect(addFieldKey('escape', typed('pay rent'))).toEqual({ kind: 'toList' });
    expect(addFieldKey('escape', typed(''))).toEqual({ kind: 'toList' });
  });
});

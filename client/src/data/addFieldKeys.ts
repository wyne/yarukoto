/**
 * What a key does in the add field, apart from typing.
 *
 * The field sits in a ring of panes (focusPanes.ts), and the list it leads to
 * acts on a task with single keys. So a key that can also be part of typing —
 * Tab reached for to complete a word, ↓ to get to the end of it — only takes
 * the keyboard out of the field once there is nothing typed. With text there,
 * it either finishes the token being typed or does nothing; it never carries a
 * draft, and the next keystroke meant for it, somewhere else. Escape is the one
 * deliberate way out, and leaves the draft where it was.
 */
export type AddFieldAction =
  /** Take this suggestion, by index. */
  | { kind: 'complete'; index: number }
  /** Move the highlight through the suggestions. */
  | { kind: 'highlight'; delta: 1 | -1 }
  /** Hand the keyboard to the next pane round the ring, or the previous one. */
  | { kind: 'leave'; delta: 1 | -1 }
  /** Give the keyboard to the list. */
  | { kind: 'toList' }
  /** Take the key and do nothing, so it neither types nor moves focus. */
  | { kind: 'swallow' }
  /** Not the field's key: let it do what it does by default. */
  | { kind: 'pass' };

export interface AddFieldState {
  text: string;
  suggestionCount: number;
  /** -1 when nothing is highlighted. */
  selectedIndex: number;
}

export function addFieldKey(name: string, { text, suggestionCount, selectedIndex }: AddFieldState): AddFieldAction {
  const empty = text.trim() === '';
  const suggesting = suggestionCount > 0;
  switch (name) {
    case 'tab':
      // The highlighted suggestion, or the top one, so `~ad` Tab is `~Admin`.
      if (suggesting) return { kind: 'complete', index: selectedIndex >= 0 ? selectedIndex : 0 };
      return empty ? { kind: 'leave', delta: 1 } : { kind: 'swallow' };
    case 'shift+tab':
      return empty ? { kind: 'leave', delta: -1 } : { kind: 'swallow' };
    case 'down':
      if (suggesting) return { kind: 'highlight', delta: 1 };
      return empty ? { kind: 'toList' } : { kind: 'pass' };
    case 'up':
      return suggesting ? { kind: 'highlight', delta: -1 } : { kind: 'pass' };
    case 'escape':
      return { kind: 'toList' };
    default:
      return { kind: 'pass' };
  }
}

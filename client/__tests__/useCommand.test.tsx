import React from 'react';
import { act, create } from 'react-test-renderer';
import { useCommand } from '../src/navigation/MenuCommands';

jest.mock('../src/data/TaskContext', () => ({}));
jest.mock('../src/components/CommandPalette', () => () => null);
jest.mock('../src/navigation/DateTimePickerContext', () => ({ navigationRef: {} }));
jest.mock('../src/navigation/SidebarContext', () => ({}));

// The phone's task sheet renders through BottomSheetModalProvider, above the
// NavigationContainer, and its notes editor registers ⌘B / ⌘I from there.
function NotesOutsideNavigation() {
  useCommand('bold', () => undefined);
  return null;
}

describe('useCommand', () => {
  it('does not throw outside a navigation container', () => {
    expect(() => {
      act(() => {
        create(<NotesOutsideNavigation />);
      });
    }).not.toThrow();
  });
});

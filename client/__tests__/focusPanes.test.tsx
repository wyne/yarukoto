import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../src/data/platform', () => ({ DESKTOP_UI: true }));
jest.mock('../src/navigation/MenuCommands', () => ({ useScreenFocused: () => true }));

import {
  focusNextPane,
  focusPane,
  isTextTarget,
  setListHasKeyboard,
  setSidebarHasKeyboard,
  sidebarHoldsKeyboard,
  takeKeyboardFromSidebar,
  useListHasKeyboard,
  usePaneFocus,
  useSidebarHoldsKeyboard,
} from '../src/navigation/focusPanes';
import type { Pane } from '../src/navigation/focusPanes';

function PaneFocus({ pane, run, enabled = true, itemKey }: {
  pane: Pane;
  run: () => void;
  enabled?: boolean;
  itemKey?: string;
}) {
  usePaneFocus(pane, run, enabled, itemKey);
  return null;
}

let keyboardState = { list: true, sidebar: false };

function KeyboardWatcher() {
  keyboardState = {
    list: useListHasKeyboard(),
    sidebar: useSidebarHoldsKeyboard(),
  };
  return null;
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00.000Z'));
  setSidebarHasKeyboard(false);
  setListHasKeyboard(true);
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('focuses the frontmost pane registration and restores the one behind it', () => {
  const behind = jest.fn();
  const front = jest.fn();
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <>
        <PaneFocus pane="list" run={behind} />
        <PaneFocus pane="list" run={front} />
      </>
    );
  });
  expect(focusPane('list')).toBe(true);
  expect(front).toHaveBeenCalledTimes(1);

  act(() => root.update(<PaneFocus pane="list" run={behind} />));
  expect(focusPane('list')).toBe(true);
  expect(behind).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  expect(focusPane('list')).toBe(false);
});

test('waits for the keyed pane that is mounting', () => {
  const oldTask = jest.fn();
  const nextTask = jest.fn();
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<PaneFocus pane="pane" itemKey="old" run={oldTask} />);
  });

  expect(focusPane('pane', { key: 'next' })).toBe(true);
  expect(oldTask).not.toHaveBeenCalled();
  act(() => root.update(<PaneFocus pane="pane" itemKey="next" run={nextTask} />));
  expect(requestAnimationFrame).toHaveBeenCalled();
  expect(nextTask).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

test('moves around the pane ring and skips panes that are absent', () => {
  const sidebar = jest.fn();
  const list = jest.fn();
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <>
        <PaneFocus pane="sidebar" run={sidebar} />
        <PaneFocus pane="list" run={list} />
      </>
    );
  });

  focusNextPane('sidebar', 1);
  expect(list).toHaveBeenCalledTimes(1);
  focusNextPane('list', 1);
  expect(sidebar).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

test('tracks keyboard ownership and releases the sidebar before claiming the list', () => {
  const claim = jest.fn();
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<KeyboardWatcher />);
    setSidebarHasKeyboard(true);
  });
  expect(keyboardState).toEqual({ list: false, sidebar: true });
  expect(sidebarHoldsKeyboard()).toBe(true);

  act(() => takeKeyboardFromSidebar(claim));
  expect(requestAnimationFrame).toHaveBeenCalled();
  expect(claim).toHaveBeenCalledTimes(1);
  expect(keyboardState.sidebar).toBe(false);

  act(() => takeKeyboardFromSidebar(claim));
  expect(claim).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});

test('recognizes text-entry targets', () => {
  expect(isTextTarget(null)).toBe(false);
  expect(isTextTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
  expect(isTextTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
  expect(isTextTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
  expect(isTextTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
  expect(isTextTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
});

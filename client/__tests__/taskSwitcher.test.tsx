import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

const mockShowTask = jest.fn();
let mockOpenTaskId: string | null = null;
let mockDialog: Record<string, any> = {};
const mockTasks = ['a', 'b', 'c'].map((id) => ({ id, title: id.toUpperCase(), listId: null, completed: id === 'c' }));

jest.mock('../src/data/platform', () => ({ MAC: false, MAC_KEYS: false, DESKTOP_UI: true, FINE_POINTER: true }));
jest.mock('../modules/mac-menu/src/MacMenu', () => null);
jest.mock('../src/data/TaskContext', () => ({ useTasks: () => ({ state: { tasks: mockTasks, lists: [] } }) }));
jest.mock('../src/navigation/DetailContext', () => ({ useDetail: () => ({ openTaskId: mockOpenTaskId }) }));
jest.mock('../src/navigation/showTask', () => ({ useShowTask: () => mockShowTask }));
jest.mock('../src/components/Dialog', () => (props: Record<string, any>) => {
  mockDialog = props;
  return props.visible ? props.children : null;
});
jest.mock('../src/components/HoverPressable', () => 'Pressable');
jest.mock('../src/theme/styles', () => ({ makeStyles: () => () => ({}) }));

import TaskSwitcher from '../src/components/TaskSwitcher';
import { DWELL_MS, resetRecentTasks } from '../src/navigation/recentTasks';

const originalOs = Object.getOwnPropertyDescriptor(Platform, 'OS');
const listeners: Record<string, ((e: any) => void)[]> = {};
const fire = (type: string, e: Record<string, unknown>) => {
  const event = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, code: '', preventDefault: jest.fn(), stopPropagation: jest.fn(), ...e };
  act(() => listeners[type]?.forEach((l) => l(event)));
  return event;
};

beforeEach(() => {
  jest.useFakeTimers();
  resetRecentTasks();
  mockShowTask.mockClear();
  for (const k of Object.keys(listeners)) delete listeners[k];
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const add = (type: string, l: any) => (listeners[type] ??= []).push(l);
  const remove = (type: string, l: any) => (listeners[type] = (listeners[type] ?? []).filter((x) => x !== l));
  Object.defineProperty(global, 'document', { configurable: true, value: { addEventListener: add, removeEventListener: remove } });
  Object.defineProperty(global, 'window', { configurable: true, value: { addEventListener: add, removeEventListener: remove } });
});

afterEach(() => {
  jest.useRealTimers();
  if (originalOs) Object.defineProperty(Platform, 'OS', originalOs);
});

/** Opens each task in turn, long enough for it to count. */
function renderHaving(opened: string[]) {
  let root!: ReactTestRenderer;
  mockOpenTaskId = null;
  act(() => {
    root = create(<TaskSwitcher />);
  });
  for (const id of opened) {
    mockOpenTaskId = id;
    act(() => root.update(<TaskSwitcher />));
    act(() => jest.advanceTimersByTime(DWELL_MS));
  }
  return root;
}

test('a quick Ctrl+Tab goes back to the task before', () => {
  const root = renderHaving(['a', 'b']);
  const down = fire('keydown', { key: 'Tab', ctrlKey: true });
  expect(down.preventDefault).toHaveBeenCalled();
  expect(mockDialog.visible).toBe(true);
  fire('keyup', { key: 'Control' });
  expect(mockShowTask).toHaveBeenCalledWith('a');
  expect(mockDialog.visible).toBe(false);
  act(() => root.unmount());
});

test('holding Ctrl, Tab moves down and Ctrl+` back up, leaving out done tasks', () => {
  const root = renderHaving(['c', 'a', 'b']);
  fire('keydown', { key: 'Tab', ctrlKey: true });
  // b is open, a before it; c is done, so the list is b, a and round again.
  fire('keydown', { key: 'Tab', ctrlKey: true });
  fire('keydown', { key: '`', code: 'Backquote', ctrlKey: true });
  fire('keyup', { key: 'Control' });
  expect(mockShowTask).toHaveBeenCalledWith('a');
  act(() => root.unmount());
});

test('Ctrl alone does nothing, and Escape opens nothing', () => {
  const root = renderHaving(['a', 'b']);
  fire('keyup', { key: 'Control' });
  expect(mockDialog.visible).toBe(false);
  fire('keydown', { key: 'Tab', ctrlKey: true, shiftKey: true });
  act(() => mockDialog.onClose());
  fire('keyup', { key: 'Control' });
  expect(mockShowTask).not.toHaveBeenCalled();
  act(() => root.unmount());
});

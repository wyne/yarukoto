import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

const mockOpenServer = jest.fn();
const mockToggleCollapsed = jest.fn();
const mockOpenDrawer = jest.fn();
const mockCloseDrawer = jest.fn();
const mockUndo = jest.fn();
const mockNavigate = jest.fn();
const mockOpenLink = jest.fn();
const mockCheckForUpdates = jest.fn();
const mockFocusPane = jest.fn();
const mockUseCommandKeyHints = jest.fn();
let mockPaletteProps: Record<string, any> = {};
let mockSidebar = { wide: true, railOnly: false };
let mockCollapsed = false;
let mockDrawerOpen = false;

jest.mock('../src/data/platform', () => ({
  DESKTOP_APP: true,
  DESKTOP_UI: true,
  MAC: false,
}));
jest.mock('../src/data/TaskContext', () => ({
  useTasks: () => ({ undo: mockUndo }),
  usePendingUndo: () => null,
}));
jest.mock('../src/components/CommandPalette', () => (props: Record<string, any>) => {
  mockPaletteProps = props;
  return null;
});
jest.mock('../src/components/openLayers', () => ({
  afterLayersClose: (run: () => void) => run(),
  anyLayerOpen: () => false,
}));
jest.mock('../src/data/links', () => ({
  LINKS: { setupGuide: 'setup', support: 'support', privacy: 'privacy' },
  openLink: (...args: unknown[]) => mockOpenLink(...args),
}));
jest.mock('../src/data/appUpdates', () => ({
  checkForAppUpdatesInteractively: () => mockCheckForUpdates(),
}));
jest.mock('../src/navigation/DateTimePickerContext', () => ({
  navigationRef: { navigate: (...args: unknown[]) => mockNavigate(...args) },
}));
jest.mock('../src/navigation/SidebarContext', () => ({
  useSidebar: () => ({
    ...mockSidebar,
    openServer: mockOpenServer,
    toggleCollapsed: mockToggleCollapsed,
    openDrawer: mockOpenDrawer,
  }),
  useSidebarCollapsed: () => mockCollapsed,
  useDrawerState: () => ({ drawerOpen: mockDrawerOpen, closeDrawer: mockCloseDrawer }),
}));
jest.mock('../src/navigation/focusPanes', () => ({
  focusPane: (...args: unknown[]) => mockFocusPane(...args),
}));
jest.mock('../src/navigation/shortcutHints', () => ({
  useCommandKeyHints: () => mockUseCommandKeyHints(),
}));
jest.mock('../modules/mac-menu/src/MacMenu', () => null);

import MenuCommands, {
  dispatchCommand,
  showPalettePicker,
} from '../src/navigation/MenuCommands';

const originalPlatformOs = Object.getOwnPropertyDescriptor(Platform, 'OS');

function renderMenu() {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<MenuCommands />);
  });
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPaletteProps = {};
  mockSidebar = { wide: true, railOnly: false };
  mockCollapsed = false;
  mockDrawerOpen = false;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
});

afterEach(() => {
  if (originalPlatformOs) Object.defineProperty(Platform, 'OS', originalPlatformOs);
});

test('routes global commands to their app-level behavior', () => {
  const root = renderMenu();
  expect(mockUseCommandKeyHints).toHaveBeenCalled();

  expect(dispatchCommand('settings')).toBe(true);
  expect(mockOpenServer).toHaveBeenCalledTimes(1);
  expect(dispatchCommand('checkForUpdates')).toBe(true);
  expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);

  act(() => expect(dispatchCommand('commandMenu')).toBe(true));
  expect(mockPaletteProps.visible).toBe(true);
  expect(mockPaletteProps.picker).toBeNull();
  act(() => mockPaletteProps.onClose());
  expect(mockPaletteProps.visible).toBe(false);

  act(() => expect(dispatchCommand('goToTask')).toBe(true));
  expect(mockPaletteProps.picker).toEqual({ kind: 'goToTask' });
  act(() => mockPaletteProps.onLeavePicker());
  expect(mockPaletteProps.visible).toBe(false);

  act(() => expect(dispatchCommand('keyboardShortcuts')).toBe(true));
  expect(mockPaletteProps.visible).toBe(true);
  expect(mockPaletteProps.picker).toEqual({ kind: 'keyboardShortcuts' });
  act(() => mockPaletteProps.onLeavePicker());
  expect(mockPaletteProps.visible).toBe(false);

  expect(dispatchCommand('goInbox')).toBe(true);
  expect(mockNavigate).toHaveBeenCalled();
  expect(dispatchCommand('help')).toBe(true);
  expect(dispatchCommand('support')).toBe(true);
  expect(dispatchCommand('privacy')).toBe(true);
  expect(mockOpenLink.mock.calls).toEqual([['setup'], ['support'], ['privacy']]);
  act(() => root.unmount());
});

test('a picker opened from search returns to search on Escape', () => {
  const root = renderMenu();
  act(() => {
    dispatchCommand('commandMenu');
  });
  act(() => showPalettePicker({ kind: 'moveToList', taskIds: ['t-1'] }));
  expect(mockPaletteProps.visible).toBe(true);
  expect(mockPaletteProps.picker).toEqual({ kind: 'moveToList', taskIds: ['t-1'] });

  act(() => mockPaletteProps.onLeavePicker());
  expect(mockPaletteProps.visible).toBe(true);
  expect(mockPaletteProps.picker).toBeNull();
  act(() => root.unmount());
});

test('⌘O, ⌘K and ⌘/ swap what the one menu shows, whichever is up', () => {
  const root = renderMenu();
  for (let round = 0; round < 2; round++) {
    act(() => expect(dispatchCommand('goToTask')).toBe(true));
    expect(mockPaletteProps.visible).toBe(true);
    expect(mockPaletteProps.picker).toEqual({ kind: 'goToTask' });
    act(() => expect(dispatchCommand('commandMenu')).toBe(true));
    expect(mockPaletteProps.visible).toBe(true);
    expect(mockPaletteProps.picker).toBeNull();
    act(() => expect(dispatchCommand('keyboardShortcuts')).toBe(true));
    expect(mockPaletteProps.visible).toBe(true);
    expect(mockPaletteProps.picker).toEqual({ kind: 'keyboardShortcuts' });
  }
  // Reached from the search, so Escape goes back to it.
  act(() => mockPaletteProps.onLeavePicker());
  expect(mockPaletteProps.visible).toBe(true);
  expect(mockPaletteProps.picker).toBeNull();

  // Reached from another picker, so Escape closes, as that one's would have.
  act(() => {
    dispatchCommand('goToTask');
  });
  act(() => {
    dispatchCommand('keyboardShortcuts');
  });
  act(() => mockPaletteProps.onLeavePicker());
  expect(mockPaletteProps.visible).toBe(false);
  act(() => root.unmount());
});

test('toggles pinned, narrow, and open-drawer sidebars', () => {
  mockCollapsed = true;
  let root = renderMenu();
  expect(dispatchCommand('toggleSidebar')).toBe(true);
  expect(mockToggleCollapsed).toHaveBeenCalledTimes(1);
  expect(mockFocusPane).toHaveBeenCalledWith('sidebar');
  act(() => root.unmount());

  mockSidebar = { wide: false, railOnly: false };
  mockCollapsed = false;
  root = renderMenu();
  expect(dispatchCommand('toggleSidebar')).toBe(true);
  expect(mockOpenDrawer).toHaveBeenCalledTimes(1);
  expect(mockFocusPane).toHaveBeenLastCalledWith('sidebar', { mounting: true });
  act(() => root.unmount());

  mockDrawerOpen = true;
  root = renderMenu();
  expect(dispatchCommand('toggleSidebar')).toBe(true);
  expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

test('web shortcuts prevent the browser action only when a command answers', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const add = jest.fn();
  const remove = jest.fn();
  Object.defineProperty(global, 'document', {
    configurable: true,
    value: { addEventListener: add, removeEventListener: remove },
  });
  const root = renderMenu();
  const bubble = add.mock.calls.find(([event, _listener, options]) => event === 'keydown' && options !== true)?.[1] as EventListener;
  const capture = add.mock.calls.find(([event, _listener, options]) => event === 'keydown' && options === true)?.[1] as EventListener;
  const preventDefault = jest.fn();
  const event = {
    key: 'k',
    code: 'KeyK',
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    target: { tagName: 'DIV' },
    preventDefault,
    getModifierState: () => false,
  } as unknown as KeyboardEvent;

  act(() => bubble(event));
  expect(mockPaletteProps.visible).toBe(true);
  expect(preventDefault).toHaveBeenCalledTimes(1);

  const fieldEvent = {
    ...event,
    key: 'b',
    code: 'KeyB',
    target: { tagName: 'INPUT' },
    preventDefault: jest.fn(),
  } as unknown as KeyboardEvent;
  act(() => capture(fieldEvent));
  expect(fieldEvent.preventDefault).not.toHaveBeenCalled();

  act(() => root.unmount());
  expect(remove).toHaveBeenCalledWith('keydown', capture, true);
  expect(remove).toHaveBeenCalledWith('keydown', bubble);
  Object.defineProperty(global, 'document', { configurable: true, value: undefined });
});

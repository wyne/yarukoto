import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { folder, list, task } from '../test/fixtures';

const mockNavigate = jest.fn();
const mockDispatchCommand = jest.fn((..._args: unknown[]) => true);
const mockUseTasks = jest.fn();
const mockOpenTask = jest.fn();
const mockSetAnchor = jest.fn();
const mockClearSelection = jest.fn();
const mockFocusPane = jest.fn();
const mockOpenLink = jest.fn();
let mockAvailable = new Set<string>();
let mockChecked = new Set<string>();

// Drawn as the real one is: the header, then the body.
jest.mock('../src/components/Dialog', () => {
  const { createElement } = jest.requireActual('react');
  return ({ header, children }: { header?: unknown; children?: unknown }) =>
    createElement('Dialog', null, header, children);
});
jest.mock('../src/components/HoverPressable', () => 'Pressable');
jest.mock('../modules/mac-pointer/src/KeyCommandsView', () => 'KeyCommandsView');
jest.mock('../src/theme/styles', () => ({ makeStyles: () => () => ({}) }));
jest.mock('../src/theme/ThemeContext', () => ({
  useColors: () => ({ textFaint: '#999' }),
  useAccent: () => '#4A7BF7',
  useTextScale: () => 1,
}));
jest.mock('../src/theme/focus', () => ({
  useFieldFocus: () => ({ focusProps: {}, focusStyle: null }),
}));
jest.mock('../src/data/platform', () => ({ MAC: false, MAC_KEYS: false }));
jest.mock('../src/data/links', () => ({
  LINKS: { keyboard: 'keyboard' },
  openLink: (...args: unknown[]) => mockOpenLink(...args),
}));
jest.mock('../src/data/TaskContext', () => ({
  useTasks: () => mockUseTasks(),
}));
jest.mock('../src/navigation/MenuCommands', () => ({
  dispatchCommand: (...args: unknown[]) => mockDispatchCommand(...args),
  useAvailableCommands: () => mockAvailable,
  useCheckedCommands: () => mockChecked,
}));
jest.mock('../src/navigation/DateTimePickerContext', () => ({
  navigationRef: { navigate: (...args: unknown[]) => mockNavigate(...args) },
}));
jest.mock('../src/navigation/DetailContext', () => ({
  useDetailActions: () => ({ openTask: mockOpenTask }),
}));
jest.mock('../src/navigation/SelectionContext', () => ({
  useSelectionActions: () => ({ setAnchor: mockSetAnchor, clear: mockClearSelection }),
}));
jest.mock('../src/navigation/focusPanes', () => ({
  focusPane: (...args: unknown[]) => mockFocusPane(...args),
}));
jest.mock('../src/components/openLayers', () => ({
  afterLayersClose: (run: () => void) => run(),
}));

import CommandPalette from '../src/components/CommandPalette';
import type { PalettePicker } from '../src/data/palettePickers';

const updateTask = jest.fn();
const bulkUpdate = jest.fn();
const supportsFeature = jest.fn(() => true);
const onClose = jest.fn();

const state = {
  mode: 'server',
  tasks: [
    task('t-inbox', { title: 'Inbox task', tags: ['urgent'] }),
    task('t-list', { title: 'Listed task', listId: 'l-1', tags: ['urgent', 'home'] }),
    task('t-archived', { title: 'Archived task', listId: 'l-2' }),
    task('t-done', { title: 'Finished task', completed: true }),
  ],
  lists: [
    list('l-1', { name: 'Groceries', folderId: 'f-1' }),
    list('l-2', { name: 'Old list', deletedAt: '2026-10-20T12:00:00.000Z' }),
  ],
  folders: [folder('f-1', { name: 'Home' })],
  savedFilters: [
    { id: 'sf-1', name: 'Focus', criteria: {}, order: 0, updatedAt: '2026-10-20T12:00:00.000Z' },
  ],
};

function renderPalette(picker: PalettePicker | null = null) {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<CommandPalette visible onClose={onClose} picker={picker} />);
  });
  return root;
}

function input(root: ReactTestRenderer) {
  return root.root.findByType(TextInput);
}

function rows(root: ReactTestRenderer) {
  return root.root.findAll((node) => String(node.type) === 'Pressable');
}

function textOf(node: { props: { children?: unknown } }): string {
  const visit = (value: unknown): string => {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(visit).join('');
    if (value && typeof value === 'object' && 'props' in value) {
      return visit((value as { props: { children?: unknown } }).props.children);
    }
    return '';
  };
  return visit(node.props.children);
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00.000Z'));
  jest.clearAllMocks();
  mockAvailable = new Set();
  mockChecked = new Set();
  mockUseTasks.mockReturnValue({ state, supportsFeature, bulkUpdate, updateTask });
});

afterEach(() => {
  jest.useRealTimers();
});

test('filters destinations and navigates after the palette closes', () => {
  const root = renderPalette();
  act(() => input(root).props.onChangeText('groceries'));
  expect(rows(root)).toHaveLength(1);
  expect(textOf(rows(root)[0])).toContain('Groceries');

  act(() => rows(root)[0].props.onPress());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
  act(() => jest.runOnlyPendingTimers());
  expect(mockNavigate).toHaveBeenCalledWith('Main', {
    screen: 'ListsTab',
    params: {
      screen: 'Tasks',
      params: { view: undefined, listId: 'l-1', folderId: undefined, tag: undefined },
      pop: true,
    },
  });
  act(() => root.unmount());
});

test('lists only available unchecked commands and dispatches the selected one', () => {
  mockAvailable = new Set(['settings', 'groupByNone']);
  mockChecked = new Set(['groupByNone']);
  const root = renderPalette();
  act(() => input(root).props.onChangeText('settings'));
  expect(rows(root)).toHaveLength(1);
  expect(textOf(rows(root)[0])).toContain('Settings');

  act(() => rows(root)[0].props.onPress());
  act(() => jest.runOnlyPendingTimers());
  expect(mockDispatchCommand).toHaveBeenCalledWith('settings', true);
  act(() => root.unmount());
});

test('go-to-task opens archived-list tasks from All and restores list focus', () => {
  const root = renderPalette({ kind: 'goToTask' });
  act(() => input(root).props.onChangeText('archived'));
  expect(rows(root)).toHaveLength(1);

  act(() => rows(root)[0].props.onPress());
  act(() => jest.runOnlyPendingTimers());
  expect(mockNavigate).toHaveBeenCalledWith('Main', {
    screen: 'ListsTab',
    params: {
      screen: 'Tasks',
      params: { view: 'all', listId: undefined, folderId: undefined, tag: undefined },
      pop: true,
    },
  });
  expect(mockClearSelection).toHaveBeenCalledTimes(1);
  expect(mockSetAnchor).toHaveBeenCalledWith('t-archived');
  expect(mockOpenTask).toHaveBeenCalledWith('t-archived');
  expect(mockFocusPane).toHaveBeenCalledWith('list');
  act(() => root.unmount());
});

test('move and tag pickers update their target tasks', () => {
  const moveRoot = renderPalette({ kind: 'moveToList', taskIds: ['t-inbox'] });
  act(() => input(moveRoot).props.onChangeText('groceries'));
  expect(rows(moveRoot)).toHaveLength(1);
  act(() => rows(moveRoot)[0].props.onPress());
  act(() => jest.runOnlyPendingTimers());
  expect(bulkUpdate).toHaveBeenCalledWith(['t-inbox'], { listId: 'l-1' });
  act(() => moveRoot.unmount());

  onClose.mockClear();
  const tagRoot = renderPalette({ kind: 'editTags', taskIds: ['t-inbox'] });
  act(() => input(tagRoot).props.onChangeText('Deep Work'));
  expect(rows(tagRoot)).toHaveLength(1);
  expect(textOf(rows(tagRoot)[0])).toContain('New Tag #deep-work');
  act(() => rows(tagRoot)[0].props.onPress());
  expect(updateTask).toHaveBeenCalledWith('t-inbox', { tags: ['urgent', 'deep-work'] });
  expect(onClose).not.toHaveBeenCalled();
  act(() => tagRoot.unmount());
});

test('arrow keys wrap the selection and submit the highlighted destination', () => {
  const root = renderPalette();
  const field = input(root);
  act(() => field.props.onKeyPress({ nativeEvent: { key: 'ArrowUp' }, preventDefault: jest.fn() }));
  act(() => input(root).props.onSubmitEditing());
  act(() => jest.runOnlyPendingTimers());

  expect(mockNavigate).toHaveBeenCalledWith('Main', {
    screen: 'BrowseTab',
    params: { savedFilterId: 'sf-1', at: Date.now() },
  });
  act(() => root.unmount());
});

test('shows the tag creation hint before a tag name is entered', () => {
  mockUseTasks.mockReturnValue({
    state: { ...state, tasks: state.tasks.map((entry) => ({ ...entry, tags: [] })) },
    supportsFeature,
    bulkUpdate,
    updateTask,
  });
  const root = renderPalette({ kind: 'editTags', taskIds: ['t-inbox'] });
  expect(root.root.findAllByType(Text).some((node) => textOf(node).includes('Type a name to make a tag.'))).toBe(true);
  act(() => root.unmount());
});

test('each of the search and its pickers is titled the same way', () => {
  const heading = (root: ReactTestRenderer) =>
    textOf(root.root.find((node) => node.props.accessibilityRole === 'header'));
  const cases: [PalettePicker | null, string][] = [
    [null, 'Command Menu'],
    [{ kind: 'goToTask' }, 'Go to Task'],
    [{ kind: 'keyboardShortcuts' }, 'Keyboard Shortcuts'],
    [{ kind: 'moveToList', taskIds: ['t-inbox', 't-list'] }, 'Move to List · 2 tasks'],
  ];
  for (const [picker, title] of cases) {
    const root = renderPalette(picker);
    expect(heading(root)).toBe(title);
    act(() => root.unmount());
  }
});

test('the keyboard reference searches its sections in the same menu', () => {
  const root = renderPalette({ kind: 'keyboardShortcuts' });
  const texts = () => root.root.findAllByType(Text).map((node) => textOf(node));
  expect(input(root).props.placeholder).toBe('Search shortcuts…');
  expect(texts()).toEqual(expect.arrayContaining(['Window', 'Task list', 'Go to Task']));

  act(() => input(root).props.onChangeText('tab'));
  expect(texts()).toContain('Next pane or field');
  expect(texts()).not.toContain('Go to Task');

  act(() => input(root).props.onChangeText('no-such-shortcut'));
  expect(texts()).toContain('No shortcuts match.');
  // Nothing in it is a choice: Return leaves the reference as it is.
  act(() => input(root).props.onSubmitEditing());
  expect(onClose).not.toHaveBeenCalled();
  expect(mockDispatchCommand).not.toHaveBeenCalled();

  act(() => root.root.find((node) => node.props.accessibilityRole === 'link').props.onPress());
  expect(mockOpenLink).toHaveBeenCalledWith('keyboard');
  act(() => root.unmount());
});

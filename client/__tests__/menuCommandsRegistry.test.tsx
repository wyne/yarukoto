import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockAnyLayerOpen = jest.fn(() => false);

jest.mock('../src/data/platform', () => ({
  ...jest.requireActual('../src/data/platform'),
  DESKTOP_APP: false,
  DESKTOP_UI: true,
  MAC: false,
}));
jest.mock('../src/data/TaskContext', () => ({}));
jest.mock('../src/components/CommandPalette', () => () => null);
jest.mock('../src/components/openLayers', () => ({
  afterLayersClose: (run: () => void) => run(),
  anyLayerOpen: () => mockAnyLayerOpen(),
}));
jest.mock('../src/navigation/DateTimePickerContext', () => ({
  navigationRef: { navigate: (...args: unknown[]) => mockNavigate(...args) },
}));
jest.mock('../src/navigation/SidebarContext', () => ({}));

import {
  dispatchCommand,
  useAvailableCommands,
  useCommand,
} from '../src/navigation/MenuCommands';
import type { CommandId } from '../src/navigation/commands';

let available: ReadonlySet<CommandId> = new Set();

function AvailabilityWatcher() {
  available = useAvailableCommands();
  return null;
}

function Handler({
  id,
  run,
  enabled = true,
}: {
  id: CommandId;
  run: () => void;
  enabled?: boolean;
}) {
  useCommand(id, run, enabled);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00.000Z'));
  mockNavigate.mockReset();
  mockAnyLayerOpen.mockReset().mockReturnValue(false);
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('publishes registered commands and removes them when their screen leaves', () => {
  const run = jest.fn();
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <>
        <AvailabilityWatcher />
        <Handler id="completeTask" run={run} />
      </>
    );
  });

  expect(available).toEqual(expect.objectContaining(new Set(['newTask', 'find', 'completeTask'])));
  expect(dispatchCommand('completeTask')).toBe(true);
  expect(run).toHaveBeenCalledTimes(1);

  act(() => root.update(<AvailabilityWatcher />));
  expect(available.has('completeTask')).toBe(false);
  expect(dispatchCommand('completeTask')).toBe(false);
  act(() => root.unmount());
});

test('the most recently mounted active screen answers a command', () => {
  const behind = jest.fn();
  const front = jest.fn();
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <>
        <Handler id="find" run={behind} />
        <Handler id="find" run={front} />
      </>
    );
  });

  expect(dispatchCommand('find')).toBe(true);
  expect(front).toHaveBeenCalledTimes(1);
  expect(behind).not.toHaveBeenCalled();

  act(() => {
    root.update(<Handler id="find" run={behind} />);
  });
  expect(dispatchCommand('find')).toBe(true);
  expect(behind).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

test('fallback commands navigate and are delivered when the destination registers', () => {
  const run = jest.fn();
  expect(dispatchCommand('newTask')).toBe(true);
  expect(mockNavigate).toHaveBeenCalledWith('Main', { screen: 'InboxTab' });

  let root!: ReactTestRenderer;
  act(() => {
    root = create(<Handler id="newTask" run={run} />);
  });
  expect(requestAnimationFrame).toHaveBeenCalled();
  expect(run).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

test('list commands stay behind open layers except palette picker commands', () => {
  const complete = jest.fn();
  const move = jest.fn();
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <>
        <Handler id="completeTask" run={complete} />
        <Handler id="moveToList" run={move} />
      </>
    );
  });
  mockAnyLayerOpen.mockReturnValue(true);

  expect(dispatchCommand('completeTask')).toBe(false);
  expect(dispatchCommand('moveToList')).toBe(false);
  expect(dispatchCommand('moveToList', true)).toBe(true);
  expect(complete).not.toHaveBeenCalled();
  expect(move).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

test('registered handlers always call the latest callback', () => {
  const first = jest.fn();
  const latest = jest.fn();
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<Handler id="bold" run={first} />);
  });
  act(() => root.update(<Handler id="bold" run={latest} />));

  expect(dispatchCommand('bold')).toBe(true);
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

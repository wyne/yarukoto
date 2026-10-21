import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useTaskTextDraft } from '../src/components/useTaskTextDraft';
import { task as makeTask } from '../test/fixtures';
import type { Task } from '../src/data/types';

const mockAppState = {
  currentState: 'active',
  listeners: [] as Array<(state: string) => void>,
  removers: [] as jest.Mock[],
};

interface HarnessProps {
  taskId: string;
  task: Task | undefined;
  active: boolean;
  updateTask: jest.Mock;
  beginTaskEdit: jest.Mock;
  endTaskEdit: jest.Mock;
}

let draft: ReturnType<typeof useTaskTextDraft> | undefined;

function Harness(props: HarnessProps) {
  draft = useTaskTextDraft(props);
  return null;
}

function render(props: Partial<HarnessProps> = {}) {
  const callbacks = {
    updateTask: jest.fn(),
    beginTaskEdit: jest.fn(),
    endTaskEdit: jest.fn(),
  };
  const fullProps: HarnessProps = {
    taskId: 't-1',
    task: makeTask('t-1', { title: 'Original', notes: 'Existing notes' }),
    active: true,
    ...callbacks,
    ...props,
  };
  let root: ReactTestRenderer;
  act(() => {
    root = create(<Harness {...fullProps} />);
  });
  return { root: root!, props: fullProps, callbacks };
}

function changeAppState(next: string) {
  mockAppState.currentState = next;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: next });
  act(() => {
    for (const listener of mockAppState.listeners) listener(next);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockAppState.currentState = 'active';
  mockAppState.listeners = [];
  mockAppState.removers = [];
  draft = undefined;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    mockAppState.listeners.push(listener as (state: string) => void);
    const remove = jest.fn();
    mockAppState.removers.push(remove);
    return { remove };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('coalesces rapid title and notes edits, then releases the sync hold after idle', () => {
  const { root, callbacks } = render();
  expect(callbacks.beginTaskEdit).toHaveBeenCalledWith('t-1');

  act(() => {
    draft!.setTitle('First');
    draft!.setTitle('Final title');
    draft!.setNotes('Final notes');
    jest.advanceTimersByTime(499);
  });
  expect(callbacks.updateTask).not.toHaveBeenCalled();

  act(() => jest.advanceTimersByTime(1));
  expect(callbacks.updateTask).toHaveBeenCalledTimes(1);
  expect(callbacks.updateTask).toHaveBeenCalledWith('t-1', {
    title: 'Final title',
    notes: 'Final notes',
  });
  expect(callbacks.endTaskEdit).not.toHaveBeenCalled();

  act(() => jest.advanceTimersByTime(3000));
  expect(callbacks.endTaskEdit).toHaveBeenCalledWith('t-1');

  act(() => draft!.setTitle('Typing again'));
  expect(callbacks.beginTaskEdit).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
  expect(callbacks.updateTask).toHaveBeenLastCalledWith('t-1', { title: 'Typing again' });
  expect(callbacks.endTaskEdit).toHaveBeenCalledTimes(2);
});

test('pulls clean fields from task updates while preserving the field under edit', () => {
  const { root, props, callbacks } = render();
  act(() => draft!.setTitle('Local title'));

  act(() => {
    root.update(<Harness {...props} task={makeTask('t-1', {
      title: 'Server title',
      notes: 'Server notes',
    })} />);
  });
  expect(draft!.title).toBe('Local title');
  expect(draft!.notes).toBe('Server notes');

  act(() => jest.advanceTimersByTime(500));
  expect(callbacks.updateTask).toHaveBeenCalledWith('t-1', { title: 'Local title' });
  act(() => root.unmount());
});

test('flushes and releases on background, then reacquires the hold on foreground', () => {
  const { root, callbacks } = render();
  act(() => draft!.setNotes('Saved before sleeping'));

  changeAppState('background');
  expect(callbacks.updateTask).toHaveBeenCalledWith('t-1', { notes: 'Saved before sleeping' });
  expect(callbacks.endTaskEdit).toHaveBeenCalledTimes(1);

  changeAppState('active');
  expect(callbacks.beginTaskEdit).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
  expect(mockAppState.removers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
});

test('an inactive editor saves without taking a sync hold', () => {
  const { root, callbacks } = render({ active: false });
  expect(callbacks.beginTaskEdit).not.toHaveBeenCalled();
  act(() => {
    draft!.setTitle('Inactive edit');
    jest.advanceTimersByTime(500);
  });
  expect(callbacks.updateTask).toHaveBeenCalledWith('t-1', { title: 'Inactive edit' });
  expect(callbacks.endTaskEdit).not.toHaveBeenCalled();
  act(() => root.unmount());
});

test('does not write a draft when its task is unavailable', () => {
  const { root, callbacks } = render({ task: undefined });
  act(() => {
    draft!.setTitle('Orphaned edit');
    jest.advanceTimersByTime(500);
  });
  expect(callbacks.updateTask).not.toHaveBeenCalled();
  act(() => root.unmount());
});

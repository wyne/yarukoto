import React from 'react';
import { act, create } from 'react-test-renderer';

const mockAdd = jest.fn((..._args: unknown[]) => 'task-1');
jest.mock('../src/data/TaskContext', () => ({
  useTasks: () => ({ state: { lists: [] }, addTaskFromQuickAdd: mockAdd }),
}));

import { useQuickAddDraft } from '../src/components/useQuickAddDraft';

type Draft = ReturnType<typeof useQuickAddDraft>;

function renderDraft() {
  const ref: { current: Draft } = { current: undefined as unknown as Draft };
  function Probe() {
    ref.current = useQuickAddDraft();
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return ref;
}

beforeEach(() => mockAdd.mockClear());

test('picking a time keeps a typed date editable', () => {
  const draft = renderDraft();
  act(() => draft.current.changeText('Call tomorrow'));
  const typedDate = draft.current.effective.dueDate;
  expect(typedDate).toBeDefined();

  act(() => draft.current.changeTime('09:00'));
  expect(draft.current.effective).toMatchObject({ dueDate: typedDate, dueTime: '09:00' });

  // Deleting the typed date unschedules the draft, time and all.
  act(() => draft.current.changeText('Call'));
  expect(draft.current.effective.dueDate).toBeUndefined();
  expect(draft.current.effective.dueTime).toBeUndefined();

  act(() => {
    draft.current.commit();
  });
  expect(mockAdd).toHaveBeenCalledWith('Call', expect.objectContaining({ dueDate: undefined, dueTime: undefined }), []);
});

test('clearing the time keeps a typed date editable', () => {
  const draft = renderDraft();
  act(() => draft.current.changeText('Call tomorrow'));
  act(() => draft.current.changeTime(undefined));
  act(() => draft.current.changeText('Call'));
  expect(draft.current.effective.dueDate).toBeUndefined();
});

test('a picked time rides on a picked date', () => {
  const draft = renderDraft();
  act(() => draft.current.changeText('Call'));
  act(() => draft.current.changeDue('2030-01-02', undefined));
  act(() => draft.current.changeTime('17:00'));
  expect(draft.current.effective).toMatchObject({ dueDate: '2030-01-02', dueTime: '17:00' });

  act(() => {
    draft.current.commit();
  });
  expect(mockAdd).toHaveBeenCalledWith(
    'Call',
    expect.objectContaining({ dueDate: '2030-01-02', dueTime: '17:00' }),
    []
  );
});

test('a picked time replaces a typed one and leaves the typed date', () => {
  const draft = renderDraft();
  act(() => draft.current.changeText('Call tomorrow 6pm'));
  const typedDate = draft.current.effective.dueDate;
  act(() => draft.current.changeTime('09:00'));
  expect(draft.current.text).toBe('Call tomorrow');
  expect(draft.current.effective).toMatchObject({ dueDate: typedDate, dueTime: '09:00' });
});

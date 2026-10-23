jest.mock('../src/data/TaskContext', () => ({ UNDO_TIMEOUT_MS: 5000, useTasks: jest.fn() }));
jest.mock('../src/navigation/DateTimePickerContext', () => ({ navigationRef: { navigate: jest.fn() } }));
jest.mock('../src/navigation/DetailContext', () => ({ useDetailActions: jest.fn() }));
jest.mock('../src/navigation/SelectionContext', () => ({ useSelectionActions: jest.fn() }));
jest.mock('../src/navigation/focusPanes', () => ({ focusPane: jest.fn() }));
jest.mock('../src/components/openLayers', () => ({ afterLayersClose: jest.fn() }));

import { taskHome } from '../src/navigation/showTask';
import { ListDef } from '../src/data/types';

const list = (id: string, name: string, deletedAt: string | null = null) =>
  ({ id, name, order: 0, deletedAt }) as unknown as ListDef;

describe('taskHome', () => {
  const lists = [list('l1', 'Groceries'), list('l2', 'Old', '2026-01-01T00:00:00Z')];

  it('is the Inbox for a task with no list', () => {
    expect(taskHome({ listId: null }, lists)).toEqual({ route: 'InboxTab', name: 'Inbox' });
  });

  it("is the task's own list", () => {
    expect(taskHome({ listId: 'l1' }, lists)).toEqual({ route: 'InboxTab', params: { listId: 'l1' }, name: 'Groceries' });
  });

  it('is All for a list that has been deleted', () => {
    expect(taskHome({ listId: 'l2' }, lists)).toEqual({ route: 'AllTab', name: 'All' });
  });
});

import { FolderDef, ListDef, Task } from '../src/data/types';

const NOW = '2026-09-27T12:00:00.000Z';

export function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    notes: '',
    priority: 'none',
    listId: null,
    tags: [],
    subtasks: [],
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
    order: 0,
    ...overrides,
  };
}

export function list(id: string, overrides: Partial<ListDef> = {}): ListDef {
  return {
    id,
    name: id,
    color: '#888888',
    folderId: null,
    order: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

export function folder(id: string, overrides: Partial<FolderDef> = {}): FolderDef {
  return {
    id,
    name: id,
    order: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

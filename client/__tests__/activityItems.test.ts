import { summarize } from '../src/data/activityItems';
import { Task } from '../src/data/types';

const T0 = '2026-10-01T12:00:00.000Z';
const base: Task = {
  id: 't1',
  title: 'water plants',
  notes: '',
  priority: 'none',
  listId: null,
  tags: [],
  subtasks: [],
  completed: false,
  createdAt: T0,
  updatedAt: T0,
  order: 0,
};

test('an edit names the fields it changed', () => {
  const task = { ...base, priority: 'high' as const };
  const [item] = summarize({ id: 2, taskId: 't1', task, previousTask: base, op: 'update', recordedAt: T0 }, new Date(T0), []);
  expect(item.title).toBe('Edited priority');
  expect(item.changes).toEqual([{ label: 'Priority', before: 'None', after: 'High' }]);
});

test('a revision with nothing before it reads as an edit, not a creation', () => {
  // The oldest revision a task keeps once older ones are pruned.
  const items = summarize({ id: 9, taskId: 't1', task: base, previousTask: null, op: 'update', recordedAt: T0 }, new Date(T0), []);
  expect(items.map((item) => item.title)).toEqual(['Edited task']);
});

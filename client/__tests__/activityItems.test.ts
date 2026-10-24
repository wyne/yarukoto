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

test('each entry carries the list the task was in at that revision', () => {
  // Moved out of Home and completed in one push: both entries name where it ended up.
  const task = { ...base, listId: 'errands', completed: true };
  const items = summarize({ id: 3, taskId: 't1', task, previousTask: { ...base, listId: 'home' }, op: 'update', recordedAt: T0 }, new Date(T0), []);
  expect(items.map((item) => item.listId)).toEqual(['errands', 'errands']);
});

test('a revision with nothing before it reads as an edit, not a creation', () => {
  // The oldest revision a task keeps once older ones are pruned.
  const items = summarize({ id: 9, taskId: 't1', task: base, previousTask: null, op: 'update', recordedAt: T0 }, new Date(T0), []);
  expect(items.map((item) => item.title)).toEqual(['Edited task']);
});

const sub = (id: string, title: string, done = false) => ({ id, title, done });
const edit = (previousTask: Task, task: Task) =>
  summarize({ id: 3, taskId: 't1', task, previousTask, op: 'update', recordedAt: T0 }, new Date(T0), []);

describe('subtask changes', () => {
  const four = [sub('a', 'buy milk'), sub('b', 'call plumber'), sub('c', 'book flights'), sub('d', 'pack bag')];

  test('adding several lists each one, and counts past the first few', () => {
    const subtasks = [...four, sub('e', 'charge camera'), sub('f', 'water plants')];
    const [item] = edit(base, { ...base, subtasks });
    expect(item.title).toBe('Added 6 subtasks');
    expect(item.changes?.[0].diff).toEqual({
      lines: four.map((subtask) => ({ kind: 'added', text: subtask.title })),
      hidden: 2,
      unit: 'subtask',
    });
  });

  test('checking off names the subtasks and the progress', () => {
    const subtasks = four.map((subtask) => (subtask.id === 'b' ? { ...subtask, done: true } : subtask));
    const [item] = edit({ ...base, subtasks: four }, { ...base, subtasks });
    expect(item.title).toBe('Checked off subtask');
    expect(item.detail).toBe('1 of 4 done');
    expect(item.changes?.[0].diff?.lines).toEqual([{ kind: 'checked', text: 'call plumber' }]);
  });

  test('a rename shows the old title beside the new one', () => {
    const subtasks = four.map((subtask) => (subtask.id === 'b' ? { ...subtask, title: 'call plumber re: sink' } : subtask));
    const [item] = edit({ ...base, subtasks: four }, { ...base, subtasks });
    expect(item.title).toBe('Renamed subtask');
    expect(item.changes?.[0].diff?.lines).toEqual([{ kind: 'renamed', before: 'call plumber', text: 'call plumber re: sink' }]);
  });

  test('mixed changes read as an edit with a line each', () => {
    const previous = [...four.slice(0, 3), sub('d', 'pack bag', true)];
    const subtasks = [four[0], four[1], sub('d', 'pack bag'), sub('e', 'charge camera')];
    const [item] = edit({ ...base, subtasks: previous }, { ...base, subtasks });
    expect(item.title).toBe('Edited subtasks');
    expect(item.changes?.[0].diff?.lines).toEqual([
      { kind: 'added', text: 'charge camera' },
      { kind: 'removed', text: 'book flights' },
      { kind: 'unchecked', text: 'pack bag' },
    ]);
  });

  test('moving subtasks around is a reorder with no lines', () => {
    const [item] = edit({ ...base, subtasks: four }, { ...base, subtasks: [...four].reverse() });
    expect(item.title).toBe('Reordered subtasks');
    expect(item.changes?.[0].diff).toBeUndefined();
  });

  test('alongside another field it is one of the fields edited', () => {
    const [item] = edit(base, { ...base, priority: 'high', subtasks: [four[0]] });
    expect(item.title).toBe('Edited 2 fields');
    expect(item.detail).toBeUndefined();
  });
});

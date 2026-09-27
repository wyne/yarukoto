import assert from 'node:assert/strict';
import test from 'node:test';
import { TaskRow, ViewPrefRow, taskFromRow, viewPrefFromRow } from '../src/model';

function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    title: 'Test task',
    notes: '',
    priority: 'none',
    due_date: '2026-09-30',
    due_time: null,
    reminders: '[]',
    list_id: null,
    tags: '[]',
    subtasks: '[]',
    completed: 0,
    completed_at: null,
    created_at: '2026-09-27T12:00:00.000Z',
    order_key: 0,
    updated_at: '2026-09-27T12:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

test('task rows discard malformed and duplicate reminders', () => {
  const task = taskFromRow(
    taskRow({
      reminders: JSON.stringify([
        { id: 'valid', offsetDays: 1, time: '09:30' },
        { id: 'duplicate', offsetDays: 1, time: '09:30' },
        { id: 'bad-time', offsetDays: 0, time: '25:00' },
        { id: 'bad-days', offsetDays: -1, time: '08:00' },
      ]),
    })
  );

  assert.deepEqual(task.reminders, [{ id: 'valid', offsetDays: 1, time: '09:30' }]);
});

test('tasks without a due date never expose stored reminders', () => {
  const task = taskFromRow(
    taskRow({
      due_date: null,
      reminders: JSON.stringify([{ id: 'stale', offsetDays: 0, time: '09:30' }]),
    })
  );

  assert.equal(task.reminders, undefined);
});

test('unknown view preferences fall back to supported values', () => {
  const row: ViewPrefRow = {
    id: 'today',
    group_by: 'future-group',
    sort_by: 'future-sort',
    arrangements: '[]',
    updated_at: '2026-09-27T12:00:00.000Z',
    deleted_at: null,
  };

  assert.deepEqual(viewPrefFromRow(row), {
    id: 'today',
    groupBy: 'none',
    sortBy: 'manual',
    arrangements: {},
    updatedAt: row.updated_at,
    deletedAt: undefined,
  });
});

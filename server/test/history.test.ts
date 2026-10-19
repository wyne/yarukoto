import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { SERVER_FEATURES } from '@yarukoto/domain/types';
import { runMigrations } from '../src/db';
import { registerHistoryRoutes } from '../src/routes/history';
import { createTask, updateTask } from '../src/taskService';
import { authedApp, OWNER_AUTH } from './helpers';

test('a task history pairs each revision with the one before it, newest first', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const app = authedApp(db);
  registerHistoryRoutes(app, db);
  await app.ready();

  const created = createTask(db, { title: 'water plants' });
  updateTask(db, created.id, { priority: 'high' });
  updateTask(db, created.id, { title: 'water the plants' });

  const res = await app.inject({ headers: OWNER_AUTH, method: 'GET', url: `/api/v1/tasks/${created.id}/history` });
  const { revisions } = res.json();
  assert.deepEqual(
    revisions.map((r: { op: string; task: { title: string } }) => [r.op, r.task.title]),
    [
      ['update', 'water the plants'],
      ['update', 'water plants'],
      ['create', 'water plants'],
    ]
  );
  assert.equal(revisions[0].previousTask.title, 'water plants');
  assert.equal(revisions[1].previousTask.priority, 'none');
  assert.equal(revisions[2].previousTask, null);
  assert.ok(revisions[0].id > revisions[1].id);
  assert.ok(revisions.every((r: { taskId: string }) => r.taskId === created.id));

  const missing = await app.inject({ headers: OWNER_AUTH, method: 'GET', url: '/api/v1/tasks/nope/history' });
  assert.deepEqual(missing.json(), { revisions: [] });
});

test('the task history is advertised', () => {
  assert.ok(SERVER_FEATURES.includes('taskHistory'));
});

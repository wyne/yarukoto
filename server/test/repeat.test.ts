import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Task } from '@yarukoto/domain/types';
import { runMigrations } from '../src/db';
import { buildMcpServer } from '../src/mcp';
import { registerSyncRoutes } from '../src/routes/sync';
import { registerTaskRoutes } from '../src/routes/tasks';
import { completeTaskAt, createTask, getTask, listTasks, readRepeat, skipTask, updateTask } from '../src/taskService';
import { authedApp, OWNER_AUTH } from './helpers';

const sunday = new Date(2026, 8, 27, 12);
const WEEKLY_MON = { rule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', from: 'due' as const };

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function base(id: string, fields: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    notes: '',
    priority: 'none',
    dueDate: '2026-10-05',
    listId: null,
    tags: [],
    subtasks: [{ id: 's1', title: 'step', done: true }],
    completed: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    order: 0,
    ...fields,
  };
}

test('completing a repeating task moves it on and keeps the occurrence', () => {
  const db = openDb();
  const created = createTask(db, { title: 'bins', dueDate: '2026-10-05', repeat: 'every monday' }, sunday);
  assert.deepEqual(created.repeat, WEEKLY_MON);

  const series = updateTask(db, created.id, { completed: true });
  assert.equal(series.id, created.id);
  assert.equal(series.completed, false);
  assert.equal(series.dueDate, '2026-10-12');

  const done = listTasks(db, { status: 'completed' });
  assert.equal(done.length, 1);
  assert.equal(done[0].id, `${created.id}@2026-10-05`);
  assert.equal(done[0].repeat, null);
  assert.equal(done[0].dueDate, '2026-10-05');
});

test('the last occurrence just completes', () => {
  const db = openDb();
  const created = createTask(db, { title: 'course', dueDate: '2026-10-05', repeat: 'FREQ=DAILY;COUNT=1' }, sunday);
  const done = updateTask(db, created.id, { completed: true });
  assert.equal(done.completed, true);
  assert.equal(listTasks(db, { status: 'all' }).length, 1);
});

test("a notification's Mark done rolls the series, and the same tap again is a no-op", () => {
  const db = openDb();
  const created = createTask(db, { title: 'pills', dueDate: '2026-10-05', repeat: 'every day' }, sunday);
  const at = new Date(Date.now() + 1000).toISOString();

  const first = completeTaskAt(db, created.id, at);
  assert.equal(first.applied, true);
  assert.equal(first.task.dueDate, '2026-10-06');
  assert.equal(first.task.completed, false);

  const again = completeTaskAt(db, created.id, at);
  assert.equal(again.applied, false);
  assert.equal(getTask(db, created.id).dueDate, '2026-10-06');
  assert.equal(listTasks(db, { status: 'completed' }).length, 1);
});

test('skip moves on without a completed copy', () => {
  const db = openDb();
  const created = createTask(db, { title: 'gym', dueDate: '2026-10-05', repeat: 'every mon, wed' }, sunday);
  assert.equal(skipTask(db, created.id).dueDate, '2026-10-07');
  assert.equal(listTasks(db, { status: 'completed' }).length, 0);

  const plain = createTask(db, { title: 'once', dueDate: '2026-10-05' }, sunday);
  assert.throws(() => skipTask(db, plain.id), /repeating/);
});

test('repeats are read from phrases and RRULEs, and refused when unreadable', () => {
  assert.deepEqual(readRepeat('every weekday'), { rule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR', from: 'due' });
  assert.deepEqual(readRepeat('weekday'), { rule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR', from: 'due' });
  assert.deepEqual(readRepeat('every! 3 days'), { rule: 'FREQ=DAILY;INTERVAL=3', from: 'completion' });
  assert.deepEqual(readRepeat('RRULE:FREQ=MONTHLY;BYDAY=-1FR'), { rule: 'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR', from: 'due' });
  assert.deepEqual(readRepeat({ rule: 'FREQ=YEARLY', from: 'completion' }), { rule: 'FREQ=YEARLY;INTERVAL=1', from: 'completion' });
  assert.throws(() => readRepeat('every time it rains'), /Can't read/);
  assert.throws(() => readRepeat({ rule: 'FREQ=SECONDLY', from: 'due' }), /needs a rule/);
});

test('a repeat with no date starts on its first day, and clearing the date stops it', () => {
  const db = openDb();
  const created = createTask(db, { title: 'water plants', repeat: 'every day' }, sunday);
  assert.ok(created.dueDate);
  const cleared = updateTask(db, created.id, { dueDate: null });
  assert.equal(cleared.repeat, null);
  assert.equal(getTask(db, created.id).repeat, null);
});

test('quick-add text carries a repeat', () => {
  const db = openDb();
  const created = createTask(db, { text: 'take out bins every mon 7pm' }, sunday);
  assert.equal(created.title, 'take out bins');
  assert.equal(created.dueDate, '2026-09-28');
  assert.deepEqual(created.repeat, WEEKLY_MON);
});

async function syncApp() {
  const db = openDb();
  const app = authedApp(db);
  registerSyncRoutes(app, db);
  registerTaskRoutes(app, db);
  await app.ready();
  const push = (tasks: object[]) =>
    app.inject({ headers: OWNER_AUTH, method: 'POST', url: '/api/v1/sync', payload: { tasks } });
  return { db, app, push };
}

test('a push without `repeat` keeps the stored one', async () => {
  const { db, app, push } = await syncApp();
  await push([base('t-1', { repeat: WEEKLY_MON })]);
  // An app from before repeats edits the title; its row has no repeat field.
  await push([base('t-1', { title: 'renamed', updatedAt: '2026-09-02T00:00:00.000Z' })]);
  assert.deepEqual(getTask(db, 't-1').repeat, WEEKLY_MON);
  assert.equal(getTask(db, 't-1').title, 'renamed');

  await push([base('t-1', { repeat: null, updatedAt: '2026-09-03T00:00:00.000Z' })]);
  assert.equal(getTask(db, 't-1').repeat, null);
  await app.close();
});

test('an older app checking off a repeating task still rolls it, once', async () => {
  const { db, app, push } = await syncApp();
  await push([base('t-1', { repeat: WEEKLY_MON })]);

  const completedAt = '2026-10-05T12:00:00.000Z';
  const response = await push([base('t-1', { completed: true, completedAt, updatedAt: completedAt })]);
  assert.equal(response.json().tasks[0].dueDate, '2026-10-12');

  const series = getTask(db, 't-1');
  assert.equal(series.completed, false);
  assert.equal(series.dueDate, '2026-10-12');
  assert.deepEqual(series.subtasks, [{ id: 's1', title: 'step', done: false }]);
  assert.equal(getTask(db, 't-1@2026-10-05').completed, true);

  // The same stale row again changes nothing.
  await push([base('t-1', { completed: true, completedAt, updatedAt: completedAt })]);
  assert.equal(getTask(db, 't-1').dueDate, '2026-10-12');
  await app.close();
});

test('a current app rolls the series itself and the server stores what it sends', async () => {
  const { db, app, push } = await syncApp();
  await push([base('t-1', { repeat: WEEKLY_MON })]);
  const at = '2026-10-05T12:00:00.000Z';
  await push([
    base('t-1', { repeat: WEEKLY_MON, dueDate: '2026-10-12', updatedAt: at }),
    base('t-1@2026-10-05', { repeat: null, completed: true, completedAt: at, updatedAt: at }),
  ]);
  assert.equal(getTask(db, 't-1').dueDate, '2026-10-12');
  assert.equal(listTasks(db, { status: 'completed' }).length, 1);
  await app.close();
});

test('MCP creates repeating tasks, describes them and skips', async () => {
  const db = openDb();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await buildMcpServer(db).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  const parse = (result: Awaited<ReturnType<Client['callTool']>>) =>
    JSON.parse((result.content as { text: string }[])[0].text);

  const { task } = parse(
    await client.callTool({ name: 'create_task', arguments: { title: 'standup', dueDate: '2026-10-05', repeat: 'every weekday' } })
  );
  assert.equal(task.repeat, 'Every weekday');
  const skipped = parse(await client.callTool({ name: 'skip_occurrence', arguments: { id: task.id } }));
  assert.equal(skipped.task.dueDate, '2026-10-06');
  const stopped = parse(await client.callTool({ name: 'update_task', arguments: { id: task.id, repeat: null } }));
  assert.equal(stopped.task.repeat, undefined);
  await client.close();
});

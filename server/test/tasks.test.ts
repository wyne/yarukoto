import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { authedApp, OWNER_AUTH } from './helpers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Task } from '@yarukoto/domain/types';
import { runMigrations } from '../src/db';
import { wallClockNow } from '../src/clock';
import { buildMcpServer, registerMcpRoutes } from '../src/mcp';
import { registerTaskRoutes } from '../src/routes/tasks';
import { createTask, listTasks, trashTask, updateTask } from '../src/taskService';
import { upsertTask } from '../src/model';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare(
    `INSERT INTO lists (id, name, color, folder_id, order_key, updated_at, server_updated_at)
     VALUES ('l-admin', 'Admin', '#888', NULL, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
  ).run();
  return db;
}

// Sunday 27 Sep 2026, noon — "fri" is 2 Oct.
const sunday = new Date(2026, 8, 27, 12);

function revisions(db: Database.Database, id: string): string[] {
  return (db.prepare('SELECT op FROM task_revisions WHERE task_id = ? ORDER BY id').all(id) as { op: string }[]).map(
    (r) => r.op
  );
}

test('createTask parses quick-add text and resolves the list by name', () => {
  const db = openDb();
  const task = createTask(db, { text: 'pay rent fri 6pm #Home !high ~admin' }, sunday);

  assert.equal(task.title, 'pay rent');
  assert.equal(task.dueDate, '2026-10-02');
  assert.equal(task.dueTime, '18:00');
  assert.deepEqual(task.tags, ['home']);
  assert.equal(task.priority, 'high');
  assert.equal(task.listId, 'l-admin');
  assert.deepEqual(revisions(db, task.id), ['create']);
});

test('createTask lets explicit fields win and rejects unknown lists', () => {
  const db = openDb();
  const task = createTask(db, { text: 'call mom tomorrow !low', priority: 'high', dueDate: null }, sunday);
  assert.equal(task.priority, 'high');
  assert.equal(task.dueDate, undefined);

  assert.throws(() => createTask(db, { text: 'x ~nowhere' }, sunday), /No list named "nowhere"/);
  assert.throws(() => createTask(db, { title: '  ' }, sunday), /needs a title/);
});

test('updateTask changes only the fields it is given', () => {
  const db = openDb();
  const created = createTask(db, { text: 'write report fri 9am #work', notes: 'draft first' }, sunday);
  const updated = updateTask(db, created.id, { priority: 'medium' });

  assert.equal(updated.priority, 'medium');
  assert.equal(updated.notes, 'draft first');
  assert.equal(updated.dueDate, '2026-10-02');
  assert.equal(updated.dueTime, '09:00');
  assert.deepEqual(updated.tags, ['work']);
  assert.ok(updated.updatedAt > created.updatedAt);
  assert.deepEqual(revisions(db, created.id), ['create', 'update']);
});

test('clearing the due date clears the time and reminders with it', () => {
  const db = openDb();
  const created = createTask(db, { title: 'dentist', dueDate: '2026-10-01', dueTime: '10:00' }, sunday);
  db.prepare('UPDATE tasks SET reminders = ? WHERE id = ?').run(
    JSON.stringify([{ id: 'r1', offsetDays: 1, time: '09:00' }]),
    created.id
  );

  const cleared = updateTask(db, created.id, { dueDate: null });
  assert.equal(cleared.dueDate, undefined);
  assert.equal(cleared.dueTime, undefined);
  assert.deepEqual(cleared.reminders, []);

  assert.throws(() => updateTask(db, created.id, { dueTime: '10:00' }), /needs a dueDate/);
});

test('a server edit wins even when a device left updatedAt in the future', () => {
  const db = openDb();
  const created = createTask(db, { title: 'skewed' }, sunday);
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  upsertTask(db, { ...created, title: 'from a fast clock', updatedAt: future }, 'update');

  const updated = updateTask(db, created.id, { title: 'from the AI' });
  assert.equal(updated.title, 'from the AI');
  assert.ok(updated.updatedAt > future);
});

test('complete, trash and filters', () => {
  const db = openDb();
  const a = createTask(db, { text: 'a today #x' }, sunday);
  const b = createTask(db, { text: 'b tomorrow ~admin' }, sunday);
  const c = createTask(db, { text: 'c' }, sunday);

  updateTask(db, a.id, { completed: true });
  trashTask(db, c.id);

  assert.deepEqual(listTasks(db).map((t) => t.title), ['b']);
  assert.deepEqual(listTasks(db, { status: 'completed' }).map((t) => t.title), ['a']);
  assert.deepEqual(listTasks(db, { status: 'trash' }).map((t) => t.title), ['c']);
  assert.deepEqual(listTasks(db, { status: 'all', tag: '#X' }).map((t) => t.title), ['a']);
  assert.deepEqual(listTasks(db, { status: 'all', listId: null }).map((t) => t.title), ['a']);
  assert.deepEqual(listTasks(db, { listId: 'l-admin', dueFrom: '2026-09-28', dueTo: '2026-09-28' }).map((t) => t.id), [b.id]);
  assert.deepEqual(listTasks(db, { status: 'all', query: 'B' }).map((t) => t.title), ['b']);
  assert.throws(() => updateTask(db, c.id, { title: 'nope' }), /restore it first/);
});

test('wallClockNow reads the date in the requested zone', () => {
  // 02:30 UTC on the 28th is still the evening of the 27th in New York.
  const instant = new Date('2026-09-28T02:30:00Z');
  const ny = wallClockNow('America/New_York', instant);
  assert.equal(ny.getDate(), 27);
  assert.equal(ny.getHours(), 22);
  assert.equal(wallClockNow('UTC', instant).getDate(), 28);
});

test('REST routes create, patch, trash and restore', async () => {
  const db = openDb();
  const app = authedApp(db);
  registerTaskRoutes(app, db);
  await app.ready();

  const created = await app.inject({ headers: OWNER_AUTH, method: 'POST', url: '/api/v1/tasks', payload: { title: 'buy milk', tags: ['#Food'] } });
  assert.equal(created.statusCode, 201);
  const task = created.json().task as Task;
  assert.deepEqual(task.tags, ['food']);

  const patched = await app.inject({ headers: OWNER_AUTH, method: 'PATCH', url: `/api/v1/tasks/${task.id}`, payload: { notes: '2%' } });
  assert.equal(patched.json().task.notes, '2%');
  assert.equal(patched.json().task.title, 'buy milk');

  const bad = await app.inject({ headers: OWNER_AUTH, method: 'PATCH', url: `/api/v1/tasks/${task.id}`, payload: { priority: 'urgent' } });
  assert.equal(bad.statusCode, 400);

  const missing = await app.inject({ headers: OWNER_AUTH, method: 'GET', url: '/api/v1/tasks/t-nope' });
  assert.equal(missing.statusCode, 404);

  await app.inject({ headers: OWNER_AUTH, method: 'DELETE', url: `/api/v1/tasks/${task.id}` });
  assert.equal((await app.inject({ headers: OWNER_AUTH, method: 'GET', url: '/api/v1/tasks' })).json().tasks.length, 0);
  await app.inject({ headers: OWNER_AUTH, method: 'POST', url: `/api/v1/tasks/${task.id}/restore` });
  assert.equal((await app.inject({ headers: OWNER_AUTH, method: 'GET', url: '/api/v1/tasks?listId=inbox' })).json().tasks.length, 1);

  const lists = await app.inject({ headers: OWNER_AUTH, method: 'GET', url: '/api/v1/lists' });
  assert.deepEqual(lists.json().lists.map((l: { name: string }) => l.name), ['Admin']);

  await app.close();
});

test('the notification complete endpoint still drops a stale tap', async () => {
  const db = openDb();
  const app = authedApp(db);
  registerTaskRoutes(app, db);
  await app.ready();

  const task = createTask(db, { title: 'stale' }, sunday);
  const stale = await app.inject({
    headers: OWNER_AUTH,
    method: 'POST',
    url: `/api/v1/tasks/${task.id}/complete`,
    payload: { completedAt: '2000-01-01T00:00:00.000Z' },
  });
  assert.equal(stale.json().applied, false);

  const fresh = await app.inject({ headers: OWNER_AUTH, method: 'POST', url: `/api/v1/tasks/${task.id}/complete`, payload: {} });
  assert.equal(fresh.json().applied, true);
  assert.equal(fresh.json().task.completed, true);

  await app.close();
});

async function connect(db: Database.Database) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await buildMcpServer(db).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return client;
}

function parse(result: Awaited<ReturnType<Client['callTool']>>) {
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content[0].text);
}

test('MCP tools cover create, schedule, complete, delete and restore', async () => {
  const db = openDb();
  const client = await connect(db);

  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, [
    'complete_task',
    'create_task',
    'delete_task',
    'get_task',
    'list_lists',
    'list_saved_filters',
    'list_tasks',
    'restore_task',
    'saved_filter_tasks',
    'schedule_task',
    'skip_occurrence',
    'update_task',
  ]);

  const { task } = parse(await client.callTool({ name: 'create_task', arguments: { text: 'file taxes #admin !high' } }));
  assert.equal(task.title, 'file taxes');
  assert.equal(task.dueDate, null);

  const scheduled = parse(
    await client.callTool({ name: 'schedule_task', arguments: { id: task.id, date: '2026-10-15', time: '6 pm' } })
  );
  assert.equal(scheduled.task.dueDate, '2026-10-15');
  assert.equal(scheduled.task.dueTime, '18:00');

  const allDay = parse(await client.callTool({ name: 'schedule_task', arguments: { id: task.id, date: '2026-10-16', time: null } }));
  assert.equal(allDay.task.dueTime, null);

  const bad = await client.callTool({ name: 'schedule_task', arguments: { id: task.id, date: 'someday' } });
  assert.equal(bad.isError, true);

  const renamed = parse(await client.callTool({ name: 'update_task', arguments: { id: task.id, title: 'file 2026 taxes' } }));
  assert.equal(renamed.task.title, 'file 2026 taxes');
  assert.equal(renamed.task.priority, 'high');
  assert.equal(renamed.task.dueDate, '2026-10-16');

  parse(await client.callTool({ name: 'complete_task', arguments: { id: task.id } }));
  assert.equal(parse(await client.callTool({ name: 'list_tasks', arguments: {} })).count, 0);
  assert.equal(parse(await client.callTool({ name: 'list_tasks', arguments: { status: 'completed' } })).count, 1);

  parse(await client.callTool({ name: 'delete_task', arguments: { id: task.id } }));
  const trash = parse(await client.callTool({ name: 'list_tasks', arguments: { status: 'trash' } }));
  assert.equal(trash.tasks[0].inTrash, true);

  const restored = parse(await client.callTool({ name: 'restore_task', arguments: { id: task.id } }));
  assert.equal(restored.task.inTrash, undefined);

  const listed = parse(await client.callTool({ name: 'list_tasks', arguments: { status: 'all', timeZone: 'Asia/Tokyo' } }));
  assert.match(listed.today, /^\d{4}-\d{2}-\d{2}$/);

  const badZone = await client.callTool({ name: 'list_tasks', arguments: { timeZone: 'Mars/Olympus' } });
  assert.equal(badZone.isError, true);

  await client.close();
});

test('MCP answers over HTTP at /mcp', async () => {
  const db = openDb();
  const app = authedApp(db);
  registerMcpRoutes(app, db);
  await app.ready();

  const headers = { ...OWNER_AUTH, accept: 'application/json, text/event-stream', 'content-type': 'application/json' };
  const init = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers,
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    },
  });
  assert.equal(init.statusCode, 200);
  assert.equal(init.json().result.serverInfo.name, 'yarukoto');

  const call = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { ...headers, 'mcp-protocol-version': '2025-06-18' },
    payload: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_task', arguments: { title: 'over http' } } },
  });
  assert.equal(call.statusCode, 200);
  assert.equal(JSON.parse(call.json().result.content[0].text).task.title, 'over http');
  assert.equal(listTasks(db).length, 1);

  const get = await app.inject({ headers: OWNER_AUTH, method: 'GET', url: '/mcp' });
  assert.equal(get.statusCode, 405);

  await app.close();
});

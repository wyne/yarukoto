import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Task } from '../../shared/types';
import { parseQuickAdd } from '../../shared/quickAdd';
import { toISODate } from '../../shared/dates';
import { isValidTimeZone, wallClockNow } from './clock';
import { env } from './env';
import { buildInfo } from './version';
import {
  PRIORITIES,
  TaskServiceError,
  createTask,
  getTask,
  listLists,
  listTasks,
  restoreTask,
  trashTask,
  updateTask,
} from './taskService';

/**
 * An MCP server over the task service, so an AI client (Claude Code, Claude
 * Desktop, anything that speaks Streamable HTTP) can read and change tasks.
 *
 * It writes through `taskService`, never through `/sync`, for the reason given
 * there: a whole-row upsert from a caller that only means to change one field
 * wipes the rest. Changes reach the app on its next pull like any other edit.
 *
 * Stateless — a fresh server and transport per request, no session ids — since
 * every tool is a single request/response and there is nothing to stream.
 */
export function registerMcpRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post('/mcp', async (request, reply) => {
    const server = buildMcpServer(db);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // No sessions means no server-initiated stream (GET) and nothing to end (DELETE).
  const notAllowed = { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null };
  app.get('/mcp', async (_request, reply) => reply.code(405).header('allow', 'POST').send(notAllowed));
  app.delete('/mcp', async (_request, reply) => reply.code(405).header('allow', 'POST').send(notAllowed));
}

const timeZoneArg = z
  .string()
  .optional()
  .describe('IANA time zone for resolving "today", weekdays and times. Defaults to the server setting.');

const idArg = z.string().describe('Task id, as returned by list_tasks or create_task');

export function buildMcpServer(db: Database.Database): McpServer {
  const server = new McpServer(
    { name: 'yarukoto', version: buildInfo.version },
    {
      instructions:
        'Yarukoto is a personal todo app. Tasks live in lists (or the Inbox when listId is null) and carry ' +
        'tags, a priority, and an optional due date and time. Call list_lists to map list names to ids. ' +
        'Deleting moves a task to the Trash, where restore_task brings it back.',
    }
  );

  server.registerTool(
    'list_lists',
    {
      title: 'List lists',
      description: 'Every list, with its id. Tasks whose listId is null are in the Inbox.',
      annotations: { readOnlyHint: true },
    },
    async () => ok({ lists: listLists(db).map(({ id, name, folderId }) => ({ id, name, folderId })) })
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description:
        'Find tasks, sorted by due date then time. Defaults to open (incomplete, not trashed) tasks. ' +
        'The result includes today\'s date so relative requests like "overdue" or "this week" can be answered.',
      inputSchema: {
        status: z.enum(['open', 'completed', 'all', 'trash']).optional().describe('Defaults to open'),
        listId: z.string().optional().describe('A list id, or "inbox" for tasks in no list'),
        tag: z.string().optional(),
        dueFrom: z.string().optional().describe('Inclusive YYYY-MM-DD; excludes tasks with no due date'),
        dueTo: z.string().optional().describe('Inclusive YYYY-MM-DD; excludes tasks with no due date'),
        query: z.string().optional().describe('Case-insensitive text to find in the title or notes'),
        limit: z.number().int().min(1).max(500).optional().describe('Defaults to 100'),
        timeZone: timeZoneArg,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() => {
        const today = toISODate(wallClockNow(zone(args.timeZone)));
        const tasks = listTasks(db, {
          status: args.status,
          listId: args.listId === 'inbox' ? null : args.listId,
          tag: args.tag,
          dueFrom: args.dueFrom,
          dueTo: args.dueTo,
          query: args.query,
          limit: args.limit,
        });
        return { today, count: tasks.length, tasks: tasks.map(summarize) };
      })
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get task',
      description: 'One task in full, including notes and subtasks.',
      inputSchema: { id: idArg },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => run(() => ({ task: getTask(db, id) }))
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create task',
      description:
        'Create a task. Pass `text` in the app\'s quick-add syntax — "pay rent fri 6pm #home !high ~Admin" sets ' +
        'the title, due date and time, tag, priority and list — or pass the fields directly. Explicit fields win ' +
        'over anything parsed from text.',
      inputSchema: {
        text: z.string().optional().describe('Quick-add text: #tag, !high|!medium|!low, ~ListName, today/tomorrow/weekday, 6pm or 18:00'),
        title: z.string().optional(),
        notes: z.string().optional(),
        priority: z.enum(PRIORITIES as [string, ...string[]]).optional(),
        dueDate: z.string().optional().describe('YYYY-MM-DD, or today, tomorrow or a weekday name'),
        dueTime: z.string().optional().describe('18:00 or 6pm; needs a due date'),
        listId: z.string().nullable().optional().describe('A list id; null or omitted = Inbox'),
        tags: z.array(z.string()).optional(),
        timeZone: timeZoneArg,
      },
    },
    async (args) =>
      run(() => {
        const today = wallClockNow(zone(args.timeZone));
        const task = createTask(
          db,
          {
            text: args.text,
            title: args.title,
            notes: args.notes,
            priority: args.priority as Task['priority'] | undefined,
            dueDate: args.dueDate === undefined ? undefined : resolveDate(args.dueDate, today),
            dueTime: args.dueTime === undefined ? undefined : resolveTime(args.dueTime),
            listId: args.listId,
            tags: args.tags,
          },
          today
        );
        return { task: summarize(task) };
      })
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description:
        'Change some fields of a task; anything omitted is left as it is. `tags` replaces the whole tag list. ' +
        'Use schedule_task for due dates and complete_task to check a task off.',
      inputSchema: {
        id: idArg,
        title: z.string().optional(),
        notes: z.string().optional(),
        priority: z.enum(PRIORITIES as [string, ...string[]]).optional(),
        listId: z.string().nullable().optional().describe('A list id, or null to move to the Inbox'),
        tags: z.array(z.string()).optional(),
      },
      annotations: { idempotentHint: true },
    },
    async ({ id, priority, ...fields }) =>
      run(() => ({ task: summarize(updateTask(db, id, { ...fields, priority: priority as Task['priority'] | undefined })) }))
  );

  server.registerTool(
    'schedule_task',
    {
      title: 'Schedule task',
      description:
        'Set or clear when a task is due. Clearing the date also clears the time and any reminders. ' +
        'Reminders already on the task follow the new date; the app reschedules them after it syncs.',
      inputSchema: {
        id: idArg,
        date: z.string().nullable().describe('YYYY-MM-DD, today, tomorrow or a weekday name; null clears the due date'),
        time: z.string().nullable().optional().describe('18:00 or 6pm; null makes it all-day; omitted keeps the current time'),
        timeZone: timeZoneArg,
      },
      annotations: { idempotentHint: true },
    },
    async ({ id, date, time, timeZone }) =>
      run(() => {
        const today = wallClockNow(zone(timeZone));
        const dueDate = date === null ? null : resolveDate(date, today);
        const dueTime = time === undefined ? undefined : time === null ? null : resolveTime(time);
        return { task: summarize(updateTask(db, id, { dueDate, dueTime })) };
      })
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete task',
      description: 'Check a task off, or pass completed: false to reopen it.',
      inputSchema: { id: idArg, completed: z.boolean().optional().describe('Defaults to true') },
      annotations: { idempotentHint: true },
    },
    async ({ id, completed }) => run(() => ({ task: summarize(updateTask(db, id, { completed: completed ?? true })) }))
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete task',
      description:
        'Move a task to the Trash. It can be brought back with restore_task until the server purges the Trash.',
      inputSchema: { id: idArg },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => run(() => ({ task: summarize(trashTask(db, id)) }))
  );

  server.registerTool(
    'restore_task',
    {
      title: 'Restore task',
      description: 'Bring a task back out of the Trash.',
      inputSchema: { id: idArg },
      annotations: { idempotentHint: true },
    },
    async ({ id }) => run(() => ({ task: summarize(restoreTask(db, id)) }))
  );

  return server;
}

/** The fields a model needs to talk about a task; get_task has the rest. */
function summarize(task: Task) {
  return {
    id: task.id,
    title: task.title,
    ...(task.notes ? { notes: task.notes } : {}),
    priority: task.priority,
    dueDate: task.dueDate ?? null,
    dueTime: task.dueTime ?? null,
    listId: task.listId,
    tags: task.tags,
    ...(task.subtasks.length ? { subtasks: `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length} done` } : {}),
    completed: task.completed,
    ...(task.deletedAt ? { inTrash: true } : {}),
  };
}

function zone(timeZone: string | undefined): string {
  if (timeZone === undefined) return env.timeZone;
  if (!isValidTimeZone(timeZone)) throw new TaskServiceError('bad_request', `Unknown time zone ${timeZone}`);
  return timeZone;
}

/** An ISO date as given, or a word the quick-add parser knows ("today", "fri"). */
function resolveDate(value: string, today: Date): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = parseQuickAdd(value, today);
  if (!parsed.dueDate || parsed.title) {
    throw new TaskServiceError('bad_request', `Can't read "${value}" as a date; use YYYY-MM-DD, today, tomorrow or a weekday`);
  }
  return parsed.dueDate;
}

function resolveTime(value: string): string {
  // The parser only reads a time next to a date, so give it one to anchor to.
  const parsed = parseQuickAdd(`today ${value.replace(/\s+(am|pm)$/i, '$1')}`);
  if (!parsed.dueTime || parsed.title) {
    throw new TaskServiceError('bad_request', `Can't read "${value}" as a time; use 18:00 or 6pm`);
  }
  return parsed.dueTime;
}

function ok(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function run(fn: () => unknown) {
  try {
    return ok(fn());
  } catch (err) {
    if (err instanceof TaskServiceError) {
      return { isError: true, content: [{ type: 'text' as const, text: err.message }] };
    }
    throw err;
  }
}

import { FolderDef, ListDef, Task } from './types';
import { addDays, toISODate } from './dateUtils';

/**
 * The sample dataset.
 *
 * Serves two purposes deliberately: it backs the app's "explore with sample
 * data" mode, and it is the fixture test cases should build on. That second
 * role is why this is a pure function of `now` — same input, same output,
 * every id and timestamp included. Nothing here may read the wall clock or
 * hold state between calls, or assertions written against it will flake.
 *
 * Dates are relative to `now` so "Today" / "Tomorrow" / weekday labels are
 * always meaningful no matter when it's built.
 */
export interface SampleData {
  tasks: Task[];
  lists: ListDef[];
  folders: FolderDef[];
}

export function buildSampleData(now: Date): SampleData {
  const stamp = now.toISOString();
  // Local to the call: a module-level counter would make ids differ between runs
  // and quietly break any test that names one. Counted per prefix so tasks read
  // t-1, t-2, t-3 rather than being interleaved with the subtask numbering.
  const seq: Record<string, number> = {};
  const id = (prefix: string): string => `${prefix}-${(seq[prefix] = (seq[prefix] ?? 0) + 1)}`;
  const iso = (offsetDays: number): string => toISODate(addDays(now, offsetDays));

  // `order` is spelled out rather than derived from array position: this file
  // promises same input, same output, every field included, and a reader
  // checking what the nav should look like shouldn't have to count rows.
  //
  // Two spaces are at work. Inside a folder a list's order counts from 0. At the
  // root, folders and loose lists share one run — which is why `l-reading` (1)
  // falls between the two folders (0 and 2), and why the sample data is worth
  // having a root list at all: it is the arrangement the nav has to get right.
  const folders: FolderDef[] = [
    { id: 'f-work', name: 'Work', order: 0, updatedAt: stamp },
    { id: 'f-personal', name: 'Personal', order: 2, updatedAt: stamp },
  ];

  const lists: ListDef[] = [
    { id: 'l-engineering', name: 'Engineering', color: '#2E62D9', folderId: 'f-work', order: 0, updatedAt: stamp },
    { id: 'l-admin', name: 'Admin', color: '#DB8A00', folderId: 'f-work', order: 1, updatedAt: stamp },
    { id: 'l-reading', name: 'Reading', color: '#C22B23', folderId: null, order: 1, updatedAt: stamp },
    { id: 'l-home', name: 'Home', color: '#1E7A3C', folderId: 'f-personal', order: 0, updatedAt: stamp },
    { id: 'l-errands', name: 'Errands', color: '#8A5FD6', folderId: 'f-personal', order: 1, updatedAt: stamp },
  ];

  let order = 0;
  const base = (partial: Partial<Task> & Pick<Task, 'title' | 'listId'>): Task => ({
    id: id('t'),
    notes: '',
    priority: 'none',
    tags: [],
    subtasks: [],
    completed: false,
    createdAt: stamp,
    updatedAt: stamp,
    order: order++,
    ...partial,
  });

  const tasks: Task[] = [
    base({
      title: 'Pay rent',
      listId: 'l-home',
      priority: 'high',
      tags: ['home'],
      dueDate: iso(-1),
    }),
    base({
      title: 'Renew SSL cert',
      listId: 'l-admin',
      priority: 'medium',
      tags: ['server', 'recurring'],
      dueDate: iso(5),
      dueTime: '18:00',
      notes:
        "Wildcard cert via Let's Encrypt. Check the DNS-01 challenge — the API token expires this month.",
      subtasks: [
        { id: id('st'), title: 'Rotate API token', done: true },
        { id: id('st'), title: 'Verify DNS record', done: true },
        { id: id('st'), title: 'Run certbot renew', done: false },
        { id: id('st'), title: 'Reload nginx', done: false },
      ],
    }),
    base({
      title: 'Review PR #142',
      listId: 'l-engineering',
      priority: 'low',
      tags: ['dev'],
      dueDate: iso(0),
      subtasks: [
        { id: id('st'), title: 'Read the diff', done: true },
        { id: id('st'), title: 'Run tests locally', done: true },
        { id: id('st'), title: 'Leave review comments', done: false },
        { id: id('st'), title: 'Approve', done: false },
      ],
    }),
    base({ title: 'Buy stamps', listId: 'l-errands' }),
    base({
      title: 'Draft backup strategy doc',
      listId: 'l-admin',
      priority: 'medium',
      tags: ['server', 'docs'],
      dueDate: iso(3),
    }),
    base({
      title: 'Water plants',
      listId: 'l-home',
      completed: true,
      completedAt: stamp,
    }),

    // Engineering
    base({
      title: 'Fix flaky CI test',
      listId: 'l-engineering',
      priority: 'medium',
      tags: ['dev'],
      dueDate: iso(0),
    }),
    base({
      title: 'Update API docs',
      listId: 'l-engineering',
      priority: 'low',
      tags: ['dev', 'docs'],
      dueDate: iso(2),
    }),
    base({ title: 'Pair on auth refactor', listId: 'l-engineering', dueDate: iso(1) }),
    base({
      title: 'Investigate memory leak',
      listId: 'l-engineering',
      priority: 'high',
      tags: ['dev'],
      dueDate: iso(4),
    }),
    base({ title: 'Code review: dashboard PR', listId: 'l-engineering', priority: 'low', dueDate: iso(0) }),
    base({ title: 'Upgrade eslint config', listId: 'l-engineering' }),
    base({
      title: 'Write migration script',
      listId: 'l-engineering',
      priority: 'medium',
      tags: ['dev'],
      dueDate: iso(6),
    }),

    // Admin
    base({
      title: 'Weekly backup check',
      listId: 'l-admin',
      priority: 'medium',
      tags: ['server', 'recurring'],
      dueDate: iso(0),
      dueTime: '09:00',
    }),
    base({
      title: 'Rotate backup credentials',
      listId: 'l-admin',
      priority: 'high',
      tags: ['server', 'recurring'],
      dueDate: iso(2),
    }),
    base({ title: 'Renew domain registration', listId: 'l-admin', priority: 'medium', tags: ['server'], dueDate: iso(10) }),
    base({ title: 'File Q3 expense report', listId: 'l-admin', priority: 'low', dueDate: iso(5) }),

    // Home
    base({
      title: 'Call parents',
      listId: 'l-home',
      dueDate: iso(0),
      dueTime: '18:00',
    }),
    base({ title: 'Fix leaky faucet', listId: 'l-home' }),
    base({ title: 'Renew car registration', listId: 'l-home', priority: 'medium', tags: ['home'], dueDate: iso(9) }),

    // Errands
    base({
      title: 'Groceries run',
      listId: 'l-errands',
      priority: 'low',
      tags: ['home'],
      dueDate: iso(0),
      dueTime: '14:30',
    }),
    base({ title: 'Pick up dry cleaning', listId: 'l-errands' }),
    base({ title: 'Return library books', listId: 'l-errands', priority: 'low', dueDate: iso(2) }),

    // Unfiled — the Inbox triage pile: captured quickly, not yet sorted into a list.
    base({ title: 'Try the new pomodoro timer', listId: null }),
    base({ title: 'Look into standing desk options', listId: null }),
    base({ title: 'Book dentist appointment', listId: null, priority: 'medium' }),
    base({ title: 'Reply to Sam about the cabin weekend', listId: null, dueDate: iso(1) }),
    base({ title: 'Cancel the unused domain', listId: null, tags: ['server'] }),
  ];

  return { tasks, lists, folders };
}

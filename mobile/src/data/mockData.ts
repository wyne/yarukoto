import { FolderDef, ListDef, Task } from './types';
import { addDays, toISODate } from './dateUtils';

export const FOLDERS: FolderDef[] = [
  { id: 'f-work', name: 'Work' },
  { id: 'f-personal', name: 'Personal' },
];

export const LISTS: ListDef[] = [
  { id: 'l-engineering', name: 'Engineering', color: '#2E62D9', folderId: 'f-work' },
  { id: 'l-admin', name: 'Admin', color: '#DB8A00', folderId: 'f-work' },
  { id: 'l-home', name: 'Home', color: '#1E7A3C', folderId: 'f-personal' },
  { id: 'l-errands', name: 'Errands', color: '#8A5FD6', folderId: 'f-personal' },
];

let seq = 0;
function id(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function iso(now: Date, offsetDays: number): string {
  return toISODate(addDays(now, offsetDays));
}

/** Builds a fresh mock dataset relative to `now`, so due-date labels
 * (Today / Yesterday / Tomorrow / weekday) are always correct. */
export function buildMockTasks(now: Date): Task[] {
  const nowIso = new Date().toISOString();
  let order = 0;
  const next = (): number => order++;

  const base = (partial: Partial<Task> & Pick<Task, 'title' | 'listId'>): Task => ({
    id: id('t'),
    notes: '',
    priority: 'none',
    reminder: 'none',
    tags: [],
    subtasks: [],
    completed: false,
    createdAt: nowIso,
    order: next(),
    ...partial,
  });

  return [
    base({
      title: 'Pay rent',
      listId: 'l-home',
      priority: 'high',
      tags: ['home'],
      dueDate: iso(now, -1),
    }),
    base({
      title: 'Renew SSL cert',
      listId: 'l-admin',
      priority: 'medium',
      tags: ['server', 'recurring'],
      dueDate: iso(now, 5),
      dueTime: '18:00',
      reminder: '30m',
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
      dueDate: iso(now, 0),
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
      dueDate: iso(now, 3),
    }),
    base({
      title: 'Water plants',
      listId: 'l-home',
      completed: true,
      completedAt: nowIso,
    }),

    // Engineering
    base({
      title: 'Fix flaky CI test',
      listId: 'l-engineering',
      priority: 'medium',
      tags: ['dev'],
      dueDate: iso(now, 0),
    }),
    base({
      title: 'Update API docs',
      listId: 'l-engineering',
      priority: 'low',
      tags: ['dev', 'docs'],
      dueDate: iso(now, 2),
    }),
    base({ title: 'Pair on auth refactor', listId: 'l-engineering', dueDate: iso(now, 1) }),
    base({
      title: 'Investigate memory leak',
      listId: 'l-engineering',
      priority: 'high',
      tags: ['dev'],
      dueDate: iso(now, 4),
    }),
    base({ title: 'Code review: dashboard PR', listId: 'l-engineering', priority: 'low', dueDate: iso(now, 0) }),
    base({ title: 'Upgrade eslint config', listId: 'l-engineering' }),
    base({
      title: 'Write migration script',
      listId: 'l-engineering',
      priority: 'medium',
      tags: ['dev'],
      dueDate: iso(now, 6),
    }),

    // Admin
    base({
      title: 'Weekly backup check',
      listId: 'l-admin',
      priority: 'medium',
      tags: ['server', 'recurring'],
      dueDate: iso(now, 0),
      dueTime: '09:00',
    }),
    base({
      title: 'Rotate backup credentials',
      listId: 'l-admin',
      priority: 'high',
      tags: ['server', 'recurring'],
      dueDate: iso(now, 2),
    }),
    base({ title: 'Renew domain registration', listId: 'l-admin', priority: 'medium', tags: ['server'], dueDate: iso(now, 10) }),
    base({ title: 'File Q3 expense report', listId: 'l-admin', priority: 'low', dueDate: iso(now, 5) }),

    // Home
    base({
      title: 'Call parents',
      listId: 'l-home',
      dueDate: iso(now, 0),
      dueTime: '18:00',
    }),
    base({ title: 'Fix leaky faucet', listId: 'l-home' }),
    base({ title: 'Renew car registration', listId: 'l-home', priority: 'medium', tags: ['home'], dueDate: iso(now, 9) }),

    // Errands
    base({
      title: 'Groceries run',
      listId: 'l-errands',
      priority: 'low',
      tags: ['home'],
      dueDate: iso(now, 0),
      dueTime: '14:30',
    }),
    base({ title: 'Pick up dry cleaning', listId: 'l-errands' }),
    base({ title: 'Return library books', listId: 'l-errands', priority: 'low', dueDate: iso(now, 2) }),

    // Unfiled
    base({ title: 'Try the new pomodoro timer', listId: null }),
  ];
}

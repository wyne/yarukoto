import { Api, SyncBatch, SyncPush } from '../src/data/api';
import { Outbox, mergeBatch, pushDirty } from '../src/data/sync';
import { Task } from '../src/data/types';

const task: Task = {
  id: 't-1',
  title: 'Before',
  notes: '',
  priority: 'none',
  listId: null,
  tags: [],
  subtasks: [],
  completed: false,
  createdAt: '2026-10-03T00:00:00.000Z',
  updatedAt: '2026-10-03T00:00:00.000Z',
  order: 0,
};

const emptyCollections = { lists: [], folders: [], viewPrefs: [], savedFilters: [] };

/** An api whose push runs `duringRequest` while the request is in flight, then echoes what it was sent. */
function apiWith(duringRequest: () => void): Api {
  return {
    push: async (batch: SyncPush): Promise<SyncBatch> => {
      duringRequest();
      return { now: '', tasks: batch.tasks ?? [], ...emptyCollections, removed: { tasks: [], lists: [] } };
    },
  } as Partial<Api> as Api;
}

test('a push clears the ids it sent', async () => {
  const outbox = new Outbox([task.id]);
  await pushDirty(apiWith(() => undefined), outbox, { tasks: [task], ...emptyCollections });
  expect(outbox.has(task.id)).toBe(false);
});

test('an edit made while the push is in flight stays dirty, and its echo cannot overwrite it', async () => {
  const outbox = new Outbox([task.id]);
  const edited = { ...task, title: 'After', updatedAt: '2026-10-03T00:00:01.000Z' };
  const echoed = await pushDirty(
    apiWith(() => outbox.mark([task.id])),
    outbox,
    { tasks: [task], ...emptyCollections }
  );

  expect(outbox.has(task.id)).toBe(true);
  expect(mergeBatch([edited], echoed!.tasks, outbox.snapshot())).toEqual([edited]);
});

test('settling leaves ids that were never sent alone', () => {
  const outbox = new Outbox(['sent', 'other']);
  const sent = outbox.marksOf(['sent']);
  outbox.settle(sent);
  expect(outbox.toArray()).toEqual(['other']);
});

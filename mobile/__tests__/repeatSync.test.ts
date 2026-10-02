import { Api, SyncBatch, SyncPush } from '../src/data/api';
import { Outbox, pushDirty } from '../src/data/sync';
import { SERVER_FEATURES, ServerFeature, Task } from '../src/data/types';

const task: Task = {
  id: 't-1',
  title: 'Take the bins out',
  notes: '',
  priority: 'none',
  listId: null,
  dueDate: '2026-10-05',
  repeat: { rule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', from: 'due' },
  tags: [],
  subtasks: [],
  completed: false,
  createdAt: '2026-09-28T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
  order: 0,
};

async function push(features: readonly ServerFeature[]) {
  const sent: SyncPush[] = [];
  const empty: SyncBatch = { now: '', tasks: [], lists: [], folders: [], viewPrefs: [], savedFilters: [], removed: { tasks: [], lists: [] } };
  const api = {
    push: async (batch: SyncPush) => {
      sent.push(batch);
      return empty;
    },
  } as Partial<Api> as Api;
  await pushDirty(api, new Outbox([task.id]), { tasks: [task], lists: [], folders: [], viewPrefs: [], savedFilters: [] }, new Set(), features);
  return sent[0].tasks?.[0];
}

test('a server that keeps repeats is sent them', async () => {
  expect((await push(['taskRepeat']))?.repeat).toEqual(task.repeat);
});

test('a server that has said it cannot is not sent the field at all', async () => {
  expect(await push(['household'])).not.toHaveProperty('repeat');
});

test('an unknown server is sent everything, since a strip cannot be undone', async () => {
  expect((await push(SERVER_FEATURES))?.repeat).toEqual(task.repeat);
});

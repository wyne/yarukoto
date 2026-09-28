import { Api, SyncBatch, SyncPush } from '../src/data/api';
import { Outbox, pushDirty } from '../src/data/sync';
import { SavedFilter, ServerFeature } from '../src/data/types';
import { EMPTY_CRITERIA } from '../src/data/taskFilter';

const filter: SavedFilter = {
  id: 'sf-today',
  name: 'Due today',
  criteria: { ...EMPTY_CRITERIA, due: ['today'] },
  order: 0,
  updatedAt: '2026-09-27T12:00:00.000Z',
};

function fakeApi(sent: SyncPush[]): Api {
  const empty: SyncBatch = { now: '', tasks: [], lists: [], folders: [], viewPrefs: [], savedFilters: [] };
  return {
    health: async () => null,
    pull: async () => empty,
    push: async (batch) => {
      sent.push(batch);
      return empty;
    },
    activity: async () => [],
  };
}

async function push(features: readonly ServerFeature[]) {
  const sent: SyncPush[] = [];
  const outbox = new Outbox([filter.id]);
  await pushDirty(
    fakeApi(sent),
    outbox,
    { tasks: [], lists: [], folders: [], viewPrefs: [], savedFilters: [filter] },
    new Set(),
    features
  );
  return { sent, outbox };
}

test('a dirty saved filter is pushed to a server that keeps them', async () => {
  const { sent, outbox } = await push(['savedFilters']);
  expect(sent[0].savedFilters).toEqual([filter]);
  expect(outbox.size).toBe(0);
});

test('a server that disclaimed saved filters is not sent them', async () => {
  const { sent, outbox } = await push(['taskReminders']);
  expect(sent[0].savedFilters).toBeUndefined();
  expect(outbox.size).toBe(0);
});

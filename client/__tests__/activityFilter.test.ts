import { ActivityFilter, matchesActivityFilter, toggleActivityFilter } from '../src/data/activityFilter';

describe('activity quick filters', () => {
  it('shows everything when nothing is selected', () => {
    const none = new Set<ActivityFilter>();
    expect(matchesActivityFilter('create', none)).toBe(true);
    expect(matchesActivityFilter('restore', none)).toBe(true);
  });

  it('groups reopen with completed and restore with deleted', () => {
    expect(matchesActivityFilter('reopen', new Set<ActivityFilter>(['complete']))).toBe(true);
    expect(matchesActivityFilter('restore', new Set<ActivityFilter>(['delete']))).toBe(true);
    expect(matchesActivityFilter('edit', new Set<ActivityFilter>(['delete']))).toBe(false);
  });

  it('toggles filters and collapses a full selection back to all', () => {
    let selected = toggleActivityFilter(new Set(), 'create');
    expect([...selected]).toEqual(['create']);
    selected = toggleActivityFilter(selected, 'edit');
    selected = toggleActivityFilter(selected, 'complete');
    selected = toggleActivityFilter(selected, 'delete');
    expect(selected.size).toBe(0);
    expect(toggleActivityFilter(new Set<ActivityFilter>(['edit']), 'edit').size).toBe(0);
  });
});

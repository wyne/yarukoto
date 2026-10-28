jest.mock('../src/navigation/DateTimePickerContext', () => ({ navigationRef: {} }));

import { createNavHistory, destinationOf } from '../src/navigation/navHistory';

/** A root state with the main screen on `tab`. */
const root = (tab: object) =>
  ({ index: 0, routes: [{ name: 'Main', state: { index: 0, routes: [tab] } }] }) as never;

describe('destinationOf', () => {
  test('names the sidebar row a tab is showing', () => {
    expect(destinationOf(root({ name: 'TodayTab' }))).toEqual({ route: 'TodayTab' });
    expect(destinationOf(root({ name: 'InboxTab' }))).toEqual({ route: 'InboxTab' });
    expect(destinationOf(root({ name: 'InboxTab', params: { listId: 'l-1', folderId: undefined } }))).toEqual({
      route: 'InboxTab',
      params: { listId: 'l-1' },
    });
    expect(destinationOf(root({ name: 'BrowseTab', params: { savedFilterId: 'f-1', at: 5 } }))).toEqual({
      route: 'BrowseTab',
      params: { savedFilterId: 'f-1' },
    });
  });

  test('reads the native first tab’s stack as the rows it holds', () => {
    const lists = (screen: string, params?: object) =>
      root({ name: 'ListsTab', state: { index: 0, routes: [{ name: screen, params }] } });
    expect(destinationOf(lists('Tasks', { view: 'all' }))).toEqual({ route: 'AllTab' });
    expect(destinationOf(lists('Tasks', { tag: 'home' }))).toEqual({ route: 'InboxTab', params: { tag: 'home' } });
    expect(destinationOf(lists('Trash'))).toEqual({ route: 'TrashTab' });
    // Headed somewhere its own state doesn't hold yet.
    expect(destinationOf(root({ name: 'ListsTab', params: { screen: 'Tasks', params: { folderId: 'f' } } }))).toEqual({
      route: 'InboxTab',
      params: { folderId: 'f' },
    });
  });

  test('is nothing before the main screen is up', () => {
    expect(destinationOf(undefined)).toBeNull();
    expect(destinationOf({ index: 0, routes: [{ name: 'FirstRun' }] } as never)).toBeNull();
  });
});

describe('createNavHistory', () => {
  const all = { route: 'AllTab' };
  const today = { route: 'TodayTab' };
  const list = { route: 'InboxTab', params: { listId: 'l-1' } };

  test('goes back and forward through where you have been', () => {
    const history = createNavHistory();
    history.visit(all);
    history.visit(today);
    history.visit(list);
    expect(history.canGoForward()).toBe(false);
    expect(history.back()).toEqual(today);
    expect(history.back()).toEqual(all);
    expect(history.back()).toBeUndefined();
    expect(history.forward()).toEqual(today);
    expect(history.canGoBack()).toBe(true);
    expect(history.canGoForward()).toBe(true);
  });

  test('arriving where Back sent you adds nothing', () => {
    const history = createNavHistory();
    history.visit(all);
    history.visit(today);
    expect(history.visit({ route: 'TodayTab' })).toBe(false);
    history.back();
    expect(history.visit({ route: 'AllTab' })).toBe(false);
    expect(history.forward()).toEqual(today);
  });

  test('a new destination drops what was ahead', () => {
    const history = createNavHistory();
    history.visit(all);
    history.visit(today);
    history.back();
    history.visit(list);
    expect(history.canGoForward()).toBe(false);
    expect(history.back()).toEqual(all);
  });

  test('tells two lists apart', () => {
    const history = createNavHistory();
    history.visit(list);
    expect(history.visit({ route: 'InboxTab', params: { listId: 'l-2' } })).toBe(true);
  });

  test('keeps only the latest destinations', () => {
    const history = createNavHistory(3);
    for (const route of ['A', 'B', 'C', 'D']) history.visit({ route });
    expect(history.back()).toEqual({ route: 'C' });
    expect(history.back()).toEqual({ route: 'B' });
    expect(history.back()).toBeUndefined();
  });
});

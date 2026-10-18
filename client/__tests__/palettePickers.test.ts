import { listIdFor, listPickerItems, normalizeTag, tagPickerItems, toggleTag } from '../src/data/palettePickers';
import type { ListDef, Task } from '../src/data/types';

const task = (id: string, listId: string | null, tags: string[]) => ({ id, listId, tags }) as unknown as Task;
const list = (id: string, name: string, order: number) => ({ id, name, order, folderId: null }) as unknown as ListDef;

const tasks = [task('a', 'l1', ['work']), task('b', 'l1', ['work', 'home']), task('c', null, [])];
const lists = [list('l1', 'Errands', 1), list('l2', 'Reading', 2)];

describe('Move to List', () => {
  test('offers the Inbox first, and checks the list every task shares', () => {
    const items = listPickerItems(lists, [], tasks, ['a', 'b']);
    expect(items.map((i) => i.title)).toEqual(['Inbox', 'Errands', 'Reading']);
    expect(items.filter((i) => i.checked).map((i) => i.title)).toEqual(['Errands']);
  });

  test('checks nothing when the tasks are in different lists', () => {
    expect(listPickerItems(lists, [], tasks, ['a', 'c']).some((i) => i.checked)).toBe(false);
  });

  test('the Inbox is no list at all', () => {
    expect(listIdFor('inbox')).toBeNull();
    expect(listIdFor('l2')).toBe('l2');
  });
});

describe('Edit Tags', () => {
  test('checks a tag only when every task has it', () => {
    const items = tagPickerItems(tasks, ['a', 'b'], '');
    expect(items.find((i) => i.key === 'work')?.checked).toBe(true);
    expect(items.find((i) => i.key === 'home')?.checked).toBe(false);
  });

  test('offers to make a tag nobody has yet, and not one that exists', () => {
    expect(tagPickerItems(tasks, ['a'], '#Next Week').pop()).toMatchObject({ title: 'New Tag #next-week' });
    expect(tagPickerItems(tasks, ['a'], 'work').some((i) => i.title.startsWith('New Tag'))).toBe(false);
  });

  test('removes a tag every task has, and otherwise adds it to those without', () => {
    expect(toggleTag(tasks, ['a', 'b'], 'work')).toEqual([
      { id: 'a', tags: [] },
      { id: 'b', tags: ['home'] },
    ]);
    expect(toggleTag(tasks, ['a', 'b'], 'home')).toEqual([{ id: 'a', tags: ['work', 'home'] }]);
    expect(toggleTag(tasks, ['c'], `new:${normalizeTag('Later')}`)).toEqual([{ id: 'c', tags: ['later'] }]);
  });
});

import { FolderDef, ListDef, Task } from './types';
import { activeFolders, activeLists, activeTasks, orderedLists, tagCounts } from './selectors';

/**
 * What the command menu's pickers offer — Task ▸ Move to List… and Edit Tags…,
 * for the tasks the list's commands act on, and File ▸ Go to Task… — and what
 * choosing does. Help ▸ Keyboard Shortcuts takes the menu's place the same way,
 * though what it lists is a reference to read rather than a choice.
 *
 * Pure, so the rules for several tasks at once are tested apart from the menu:
 * a list is checked only when every task is in it, and a tag only when every
 * task has it, which is also what decides whether choosing it adds or removes.
 */

export type PalettePicker =
  | { kind: 'moveToList' | 'editTags'; taskIds: string[] }
  | { kind: 'goToTask' }
  | { kind: 'keyboardShortcuts' };

export interface PickerItem {
  key: string;
  title: string;
  keywords?: string;
  /** Right-aligned: the folder a list is in. */
  detail?: string;
  checked?: boolean;
}

export const PICKER_TITLE: Record<PalettePicker['kind'], string> = {
  moveToList: 'Move to List',
  editTags: 'Edit Tags',
  goToTask: 'Go to Task',
  keyboardShortcuts: 'Keyboard Shortcuts',
};

const INBOX_KEY = 'inbox';
const NEW_TAG_PREFIX = 'new:';

function tasksOf(tasks: Task[], ids: string[]): Task[] {
  const wanted = new Set(ids);
  return tasks.filter((t) => wanted.has(t.id));
}

/** The Inbox, then every list in sidebar order, the one all the tasks are in checked. */
export function listPickerItems(lists: ListDef[], folders: FolderDef[], tasks: Task[], ids: string[]): PickerItem[] {
  const targets = tasksOf(tasks, ids);
  const shared = targets.length > 0 && targets.every((t) => t.listId === targets[0].listId) ? targets[0].listId ?? null : undefined;
  const folderName = new Map(activeFolders(folders).map((f) => [f.id, f.name]));
  return [
    { key: INBOX_KEY, title: 'Inbox', checked: shared === null },
    ...orderedLists(activeLists(lists), folders).map((list) => ({
      key: list.id,
      title: list.name,
      detail: list.folderId ? folderName.get(list.folderId) : undefined,
      checked: shared === list.id,
    })),
  ];
}

/** The list id a list picker key stands for: null is the Inbox. */
export function listIdFor(key: string): string | null {
  return key === INBOX_KEY ? null : key;
}

/** How a typed name becomes a tag, as the tag sheet makes one. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
}

/**
 * Every tag in use, those all the tasks have checked, and — when the query
 * names a tag nobody has yet — a row to create it.
 */
export function tagPickerItems(tasks: Task[], ids: string[], query: string): PickerItem[] {
  const targets = tasksOf(tasks, ids);
  const items: PickerItem[] = tagCounts(tasks).map(({ tag }) => ({
    key: tag,
    title: `#${tag}`,
    keywords: tag,
    checked: targets.length > 0 && targets.every((t) => t.tags.includes(tag)),
  }));
  const typed = normalizeTag(query);
  if (typed && !items.some((i) => i.key === typed)) {
    // Kept matching whatever was typed, so the search never filters it out.
    items.push({ key: `${NEW_TAG_PREFIX}${typed}`, title: `New Tag #${typed}`, keywords: query });
  }
  return items;
}

/**
 * Each task's tags once a tag picker row is chosen: removed from all of them if
 * they all have it, else added to those that don't.
 */
export function toggleTag(tasks: Task[], ids: string[], key: string): { id: string; tags: string[] }[] {
  const tag = key.startsWith(NEW_TAG_PREFIX) ? key.slice(NEW_TAG_PREFIX.length) : key;
  const targets = tasksOf(tasks, ids);
  const remove = targets.length > 0 && targets.every((t) => t.tags.includes(tag));
  return targets
    .filter((t) => t.tags.includes(tag) === remove)
    .map((t) => ({ id: t.id, tags: remove ? t.tags.filter((x) => x !== tag) : [...t.tags, tag] }));
}

/**
 * Every task not yet done, matched on its title alone: a word in the notes or a
 * tag finding it would bury the task whose name you are typing. The list it is
 * in goes beside it, unsearched, to tell two of the same name apart.
 */
export function taskPickerItems(tasks: Task[], lists: ListDef[]): PickerItem[] {
  const listName = new Map(activeLists(lists).map((l) => [l.id, l.name]));
  return activeTasks(tasks)
    .filter((t) => t.title.trim())
    .map((t) => ({
      key: t.id,
      title: t.title,
      detail: t.listId === null ? 'Inbox' : listName.get(t.listId),
    }));
}

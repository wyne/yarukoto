import { NavigatorScreenParams } from '@react-navigation/native';

/** A resolved list/folder/tag filter, ready to render. Built from `InboxParams`. */
export interface TaskListFilter {
  type: 'list' | 'folder' | 'tag';
  value: string;
  label: string;
}

/**
 * The Inbox tab doubles as the host for filtered list/folder/tag views, and these say
 * which. They're ids rather than a resolved filter because on web they *are*
 * the URL query — `/inbox?listId=l-…` — so they have to survive a page load,
 * which a display label looked up from state can't. InboxScreen resolves them
 * against the current lists on every render, which also means renaming a list
 * retitles the open view instead of leaving the name it was opened with.
 */
export interface InboxParams {
  listId?: string;
  folderId?: string;
  tag?: string;
}

/** The task view shown by the stateful first native tab. */
export interface NativeTaskViewParams extends InboxParams {
  view?: 'all' | 'today';
}

/**
 * The same view, with every key spelled out — blank ones included.
 *
 * React Navigation merges a screen's `initialParams` into the params of every
 * navigation to it, not just the first (`createParamsFromAction`), and the first
 * native tab's initial params are the view it restores on launch. So a partial
 * `{ folderId }` arrives still carrying the list those restored params name, and
 * `useInboxFilter` reads `listId` before `folderId` — the folder never shows and
 * the screen sits where it was.
 *
 * Naming every key is what makes a navigation say the whole view rather than an
 * amendment to whichever one came before it.
 */
export function taskViewParams(view: NativeTaskViewParams): NativeTaskViewParams {
  return { listId: undefined, folderId: undefined, tag: undefined, view: undefined, ...view };
}

export type MainTabParamList = {
  AllTab: undefined;
  InboxTab: InboxParams | undefined;
  TodayTab: undefined;
  CalendarTab: undefined;
  ActivityTab: undefined;
  BrowseTab: undefined;
  TrashTab: undefined;
};

export type RootStackParamList = {
  FirstRun: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  DateTimePicker: { mode: 'date' | 'time'; requestId: number };
};

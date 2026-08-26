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

import { NavigatorScreenParams } from '@react-navigation/native';

export interface TaskListFilter {
  type: 'list' | 'tag';
  value: string;
  label: string;
}

export type MainTabParamList = {
  InboxTab: { filter?: TaskListFilter } | undefined;
  TodayTab: undefined;
  CalendarTab: { focusDate?: string } | undefined;
  BrowseTab: undefined;
};

export type RootStackParamList = {
  FirstRun: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  TaskDetail: { taskId: string };
};

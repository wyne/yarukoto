import { Platform } from 'react-native';
import { NativeTaskViewParams, taskViewParams } from './types';

/**
 * The rows that are views of the first native tab rather than tabs of their own.
 *
 * Inbox and Today are absent because they *are* tabs — see `MainTabs`. Inbox
 * still gets a mention in `tabNavigation` below: a list, folder or tag travels
 * on its route, and those are views of the first tab even though the bare row
 * is not.
 */
export const NATIVE_LIST_DESTINATIONS = {
  AllTab: { screen: 'Tasks', params: { view: 'all' } },
  ActivityTab: { screen: 'Activity', params: undefined },
  TrashTab: { screen: 'Trash', params: undefined },
} as const;

/**
 * The tab navigator's `navigate` call that reaches a destination, as the nav
 * names it: a tab route, plus the filter params a list, folder or tag carries
 * on the Inbox row's route.
 *
 * Shared by the nav and the command menu, so a destination chosen from either
 * lands on the same screen with the same params.
 */
export function tabNavigation(route: string, params?: object): [string, object | undefined] {
  // A list, folder or tag travels on the Inbox row's route, carrying the view
  // it wants in its params. Natively those go to the first tab, which is where
  // filtered views live; the bare Inbox row goes to the Inbox tab.
  const destination =
    Platform.OS !== 'web'
      ? route === 'InboxTab' && params
        ? { screen: 'Tasks' as const, params }
        : NATIVE_LIST_DESTINATIONS[route as keyof typeof NATIVE_LIST_DESTINATIONS]
      : undefined;
  if (!destination) return [route, params];
  const { screen, params: next } = destination;
  return [
    'ListsTab',
    {
      screen,
      // Every destination on this screen is a whole view, never a change to
      // part of one — see `taskViewParams`.
      params: screen === 'Tasks' ? taskViewParams(next as NativeTaskViewParams) : next,
      // Back to the task list already in the stack, rather than a new one on
      // top. React Navigation 7's `navigate` only reuses the route on top, so
      // leaving Activity or Trash for a list pushed a second list screen,
      // which mounted every row from scratch and left the first copy mounted
      // underneath. Activity and Trash still push: they are cheap to mount, and
      // popping to one would unmount the list above it, costing a full remount
      // on the way back.
      pop: screen === 'Tasks',
    },
  ];
}

import React, { useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NativeTaskViewParams } from './types';
import { useInboxFilter } from '../screens/InboxScreen';
import { useTasks } from '../data/TaskContext';
import {
  SavedFirstTabView,
  clearSavedFirstTabView,
  firstTabWorkspace,
  loadSavedFirstTabView,
  saveFirstTabView,
} from '../data/storage';
import TaskListScreen from '../screens/TaskListScreen';
import ActivityScreen from '../screens/ActivityScreen';
import TrashScreen from '../screens/TrashScreen';

export type NativeListStackParamList = {
  Tasks: NativeTaskViewParams | undefined;
  Activity: undefined;
  Trash: undefined;
};

const Stack = createNativeStackNavigator<NativeListStackParamList>();

function taskView(params?: NativeTaskViewParams): SavedFirstTabView {
  if (params?.listId) return { kind: 'list', id: params.listId };
  if (params?.folderId) return { kind: 'folder', id: params.folderId };
  if (params?.tag) return { kind: 'tag', value: params.tag };
  if (params?.view === 'today') return { kind: 'today' };
  return { kind: 'all' };
}

function useRememberFirstTabView(view: SavedFirstTabView) {
  const { state } = useTasks();
  const workspace = firstTabWorkspace(state.mode, state.serverUrl);
  const valueKey = 'id' in view ? view.id : 'value' in view ? view.value : '';

  // Focus is the point at which React Navigation has accepted the destination.
  // A press that is cancelled or superseded therefore never reaches storage.
  useFocusEffect(
    useCallback(() => {
      saveFirstTabView(workspace, view);
    }, [workspace, view.kind, valueKey])
  );
}

function NativeTasksScreen({ route }: { route: { params?: NativeTaskViewParams } }) {
  const filter = useInboxFilter(route.params);
  const mode = route.params?.view === 'today' ? 'today' : filter ? 'inbox' : 'all';
  const remembered = useMemo(() => taskView(route.params), [route.params]);
  useRememberFirstTabView(remembered);

  return <TaskListScreen mode={mode} filter={filter} />;
}

function NativeActivityScreen() {
  useRememberFirstTabView({ kind: 'activity' });
  return <ActivityScreen />;
}

function NativeTrashScreen() {
  useRememberFirstTabView({ kind: 'trash' });
  return <TrashScreen />;
}

function destinationFor(view: SavedFirstTabView | null): {
  screen: keyof NativeListStackParamList;
  params?: NativeTaskViewParams;
} {
  if (view?.kind === 'activity') return { screen: 'Activity' };
  if (view?.kind === 'trash') return { screen: 'Trash' };
  if (view?.kind === 'today') return { screen: 'Tasks', params: { view: 'today' } };
  if (view?.kind === 'list') return { screen: 'Tasks', params: { listId: view.id } };
  if (view?.kind === 'folder') return { screen: 'Tasks', params: { folderId: view.id } };
  if (view?.kind === 'tag') return { screen: 'Tasks', params: { tag: view.value } };
  return { screen: 'Tasks', params: { view: 'all' } };
}

/** Stateful list tab: remembers the latest drawer destination across launches. */
export default function NativeListNavigator() {
  const { state } = useTasks();
  const workspace = firstTabWorkspace(state.mode, state.serverUrl);
  const restored = loadSavedFirstTabView(workspace);
  const stale =
    (restored?.kind === 'list' &&
      !state.lists.some((list) => list.id === restored.id && !list.deletedAt)) ||
    (restored?.kind === 'folder' &&
      !state.folders.some((folder) => folder.id === restored.id && !folder.deletedAt));
  const initial = destinationFor(stale ? null : restored);

  useEffect(() => {
    if (stale) clearSavedFirstTabView(workspace);
  }, [stale, workspace]);

  return (
    <Stack.Navigator
      key={workspace}
      initialRouteName={initial.screen}
      screenOptions={{ headerShown: false }}
    >
      {/*
        These are merged into the params of every later navigation here, not just
        the first — so a caller that names only part of a view inherits the rest
        of this one. `taskViewParams` is how callers say the whole thing.
      */}
      <Stack.Screen
        name="Tasks"
        component={NativeTasksScreen}
        initialParams={initial.screen === 'Tasks' ? initial.params : { view: 'all' }}
      />
      <Stack.Screen name="Activity" component={NativeActivityScreen} />
      <Stack.Screen name="Trash" component={NativeTrashScreen} />
    </Stack.Navigator>
  );
}

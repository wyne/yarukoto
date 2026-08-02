import React from 'react';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../navigation/types';
import TaskListScreen from './TaskListScreen';

export default function InboxScreen({ navigation, route }: BottomTabScreenProps<MainTabParamList, 'InboxTab'>) {
  return <TaskListScreen mode="inbox" tabNavigation={navigation} filter={route.params?.filter} />;
}

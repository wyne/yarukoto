import React from 'react';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../navigation/types';
import TaskListScreen from './TaskListScreen';

export default function TodayScreen({ navigation }: BottomTabScreenProps<MainTabParamList, 'TodayTab'>) {
  return <TaskListScreen mode="today" tabNavigation={navigation} />;
}

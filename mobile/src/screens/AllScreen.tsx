import React from 'react';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../navigation/types';
import TaskListScreen from './TaskListScreen';

export default function AllScreen({ navigation }: BottomTabScreenProps<MainTabParamList, 'AllTab'>) {
  return <TaskListScreen mode="all" tabNavigation={navigation} />;
}

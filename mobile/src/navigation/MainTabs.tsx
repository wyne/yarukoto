import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { MainTabParamList } from './types';
import InboxScreen from '../screens/InboxScreen';
import TodayScreen from '../screens/TodayScreen';
import CalendarScreen from '../screens/CalendarScreen';
import BrowseScreen from '../screens/BrowseScreen';
import { IconCalendar, IconClock, IconFolder, IconInboxTray } from '../icons/Icons';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  const accent = useAccent();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surfaceMuted,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.sansSemiBold,
          fontSize: 10,
        },
      }}
    >
      <Tab.Screen
        name="InboxTab"
        component={InboxScreen}
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => <IconInboxTray color={color} />,
        }}
      />
      <Tab.Screen
        name="TodayTab"
        component={TodayScreen}
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <IconClock color={color} />,
        }}
      />
      <Tab.Screen
        name="CalendarTab"
        component={CalendarScreen}
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <IconCalendar color={color} />,
        }}
      />
      <Tab.Screen
        name="BrowseTab"
        component={BrowseScreen}
        options={{
          title: 'Browse',
          tabBarIcon: ({ color }) => <IconFolder color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

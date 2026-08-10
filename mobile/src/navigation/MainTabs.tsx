import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomTabBar, BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { MainTabParamList } from './types';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { DetailProvider, useDetail } from './DetailContext';
import Sidebar from '../components/Sidebar';
import SidebarDrawer from '../components/SidebarDrawer';
import TaskDetailView from '../components/TaskDetailView';
import TaskDetailSheet from '../components/TaskDetailSheet';
import AllScreen from '../screens/AllScreen';
import InboxScreen from '../screens/InboxScreen';
import TodayScreen from '../screens/TodayScreen';
import CalendarScreen from '../screens/CalendarScreen';
import BrowseScreen from '../screens/BrowseScreen';
import { IconCalendar, IconClock, IconFolder, IconInboxTray, IconStack } from '../icons/Icons';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Wide layouts swap the bottom bar for a pinned sidebar; narrow ones keep the bar
 * and mount the same sidebar as a pull-out drawer.
 */
function TabBar(props: BottomTabBarProps) {
  const { wide } = useSidebar();
  if (wide) return <Sidebar {...props} />;
  return (
    <>
      <BottomTabBar {...props} />
      <SidebarDrawer {...props} />
    </>
  );
}

export default function MainTabs() {
  return (
    <SidebarProvider>
      <DetailProvider>
        <Layout />
      </DetailProvider>
    </SidebarProvider>
  );
}

/**
 * Wide: [sidebar | list | detail] — the detail column sits beside the list rather
 * than covering it. Narrow: the same detail rendered as a pull-up sheet.
 */
function Layout() {
  const { wide } = useSidebar();
  const { openTaskId, closeTask } = useDetail();
  const showPane = wide && !!openTaskId;

  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Tabs />
      </View>
      {showPane && (
        <View style={styles.detailColumn}>
          <TaskDetailView taskId={openTaskId} onClose={closeTask} variant="pane" />
        </View>
      )}
      {!wide && <TaskDetailSheet />}
    </View>
  );
}

function Tabs() {
  const accent = useAccent();
  const { wide } = useSidebar();

  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
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
        name="AllTab"
        component={AllScreen}
        options={{
          title: 'All',
          tabBarIcon: ({ color }) => <IconStack color={color} />,
        }}
      />
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

export const DETAIL_COLUMN_WIDTH = 380;

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  detailColumn: {
    width: DETAIL_COLUMN_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.screenBg,
  },
});

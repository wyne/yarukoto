import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/colors';
import { MainTabParamList } from './types';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { DetailProvider, useDetail } from './DetailContext';
import Sidebar from '../components/Sidebar';
import SidebarDrawer from '../components/SidebarDrawer';
import TaskDetailView from '../components/TaskDetailView';
import TaskDetailSheet from '../components/TaskDetailSheet';
import UndoToast from '../components/UndoToast';
import AllScreen from '../screens/AllScreen';
import InboxScreen from '../screens/InboxScreen';
import TodayScreen from '../screens/TodayScreen';
import CalendarScreen from '../screens/CalendarScreen';
import BrowseScreen from '../screens/BrowseScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * The sidebar is the only navigation: pinned as a left column on wide layouts,
 * and mounted as a pull-out drawer on narrow ones. There is no bottom bar — it
 * only duplicated the drawer's contents.
 */
function TabBar(props: BottomTabBarProps) {
  const { wide } = useSidebar();
  if (wide) return <Sidebar {...props} />;
  return <SidebarDrawer {...props} />;
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
        <UndoToast />
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
  const { wide } = useSidebar();

  // Labels and icons live in Sidebar, which is the only thing rendering the tab
  // list; `title` is kept because React Navigation uses it for the web page title.
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
      }}
    >
      <Tab.Screen name="AllTab" component={AllScreen} options={{ title: 'All' }} />
      <Tab.Screen name="InboxTab" component={InboxScreen} options={{ title: 'Inbox' }} />
      <Tab.Screen name="TodayTab" component={TodayScreen} options={{ title: 'Today' }} />
      <Tab.Screen name="CalendarTab" component={CalendarScreen} options={{ title: 'Calendar' }} />
      <Tab.Screen name="BrowseTab" component={BrowseScreen} options={{ title: 'Browse' }} />
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

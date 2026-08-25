import React from 'react';
import { Platform, View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeBottomTabNavigator,
  NativeBottomTabBarProps,
} from '@react-navigation/bottom-tabs/unstable';
import { NavigatorScreenParams } from '@react-navigation/native';
import { makeStyles } from '../theme/styles';
import { useAccent } from '../theme/ThemeContext';
import { MainTabParamList } from './types';
import {
  DRAWER_CLOSE_EASING,
  DRAWER_CLOSE_MS,
  DRAWER_OPEN_EASING,
  DRAWER_OPEN_MS,
  SidebarProvider,
  useSidebar,
} from './SidebarContext';
import { DetailProvider, useDetail } from './DetailContext';
import { SelectionProvider, useSelection } from './SelectionContext';
import Sidebar, { SIDEBAR_WIDTH } from '../components/Sidebar';
import { closeOpenSwipeRow, swipeRowOpen } from '../components/SwipeableRow';
import SidebarDrawer from '../components/SidebarDrawer';
import TaskDetailView from '../components/TaskDetailView';
import TaskDetailSheet from '../components/TaskDetailSheet';
import BulkActions from '../components/BulkActions';
import { WEB_ENTRY } from '../data/platform';
import UndoToast from '../components/UndoToast';
import { DragProvider } from '../drag/DragContext';
import DragOverlay from '../drag/DragOverlay';
import ServerSheet from '../components/pickers/ServerSheet';
import NavSheets from '../components/sidebar/NavSheets';
import AllScreen from '../screens/AllScreen';
import InboxScreen from '../screens/InboxScreen';
import TodayScreen from '../screens/TodayScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ActivityScreen from '../screens/ActivityScreen';
import BrowseScreen from '../screens/BrowseScreen';
import TrashScreen from '../screens/TrashScreen';
import NativeListNavigator, { NativeListStackParamList } from './NativeListNavigator';

const Tab = createBottomTabNavigator<MainTabParamList>();
type NativeMainTabParamList = {
  ListsTab: NavigatorScreenParams<NativeListStackParamList> | undefined;
  InboxTab: undefined;
  CalendarTab: undefined;
  BrowseTab: undefined;
};
const NativeTab = Platform.OS === 'web'
  ? null
  : createNativeBottomTabNavigator<NativeMainTabParamList>();

/**
 * Web keeps the app's full sidebar navigation. Native uses UIKit/Android native
 * tabs below and mounts the same sidebar separately as its secondary drawer.
 */
function TabBar(props: BottomTabBarProps) {
  const { wide } = useSidebar();
  if (wide) return <Sidebar {...props} />;
  return <SidebarDrawer {...props} />;
}

/**
 * Sideways travel before the drag becomes the drawer's, and the vertical travel
 * that gives up on it first.
 *
 * The fail is deliberately the smaller of the two, which is what makes the drag
 * have to be plainly sideways: at forty-five degrees the vertical reaches 15
 * before the horizontal reaches 20, so a list dragged on the diagonal scrolls,
 * as it should. Only a drag that stays near the horizontal ever takes the nav.
 */
const SWIPE_ACTIVATE_X = 20;
const SWIPE_FAIL_Y = 15;
/** Rightward points per second that open the drawer however far it has come. */
const SWIPE_FLING = 350;

/**
 * iOS only, because it is the only platform where there is anything to drag.
 *
 * The drawer lives in a window that is always mounted there, so the panel is
 * already off screen waiting and follows the finger from the first pixel.
 * Elsewhere it is a Modal that is not presented until it opens — a swipe would
 * pull on nothing, then have a modal appear part-way through.
 */
const SWIPE_TO_OPEN = Platform.OS === 'ios';

export default function MainTabs() {
  return (
    <SidebarProvider>
      <DetailProvider>
        <SelectionProvider>
          <DragProvider>
            <Layout />
          </DragProvider>
        </SelectionProvider>
      </DetailProvider>
    </SidebarProvider>
  );
}

/**
 * Wide: [sidebar | list | detail] — the detail column sits beside the list rather
 * than covering it. Narrow: the same detail rendered as a pull-up sheet.
 */
function Layout() {
  const styles = useStyles();
  const { wide, drawerOpen, openDrawer, drawerProgress, serverOpen, closeServer } = useSidebar();
  const { openTaskId, closeTask } = useDetail();
  const { selectedIds } = useSelection();

  // A selection takes the column over: the actions apply to several tasks, so
  // showing one task's detail beside them would only mislead about what the next
  // click is going to change.
  const bulk = WEB_ENTRY && selectedIds.length > 0;
  const showPane = wide && (bulk || !!openTaskId);

  /** Set for the length of a swipe that turned out to be shutting a row. */
  const blockedByRow = useSharedValue(false);

  /**
   * Swipe right anywhere in the app to pull the drawer out.
   *
   * Anywhere rather than from the edge, because rightward is free: a row swipes
   * left to reveal its actions and nothing swipes right, so the whole list is an
   * unclaimed surface for it. An edge strip was the cautious version of this and
   * it was hard to hit — a gesture you have to aim for is one you stop using.
   *
   * The detector has to be out here rather than on the drawer. The drawer is in
   * a window of its own, and a separate window cannot pass a touch it does not
   * want back to the app beneath it, so a catcher over there would swallow
   * whatever it covered. In the app's own tree gesture-handler can arbitrate,
   * which is what leaves scrolling and tapping alone.
   */
  const swipeOpen = Gesture.Pan()
    .enabled(SWIPE_TO_OPEN && !wide && !drawerOpen)
    // Rightward only, so a row's own leftward swipe is never in the running.
    .activeOffsetX(SWIPE_ACTIVATE_X)
    .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
    .onStart(() => {
      // A rightward drag is also how an open row is shut, and that reading wins
      // — it is the nearer thing to the finger. Do it here rather than leave the
      // two gestures to fight over the touch, since this one may well have taken
      // it already.
      blockedByRow.value = swipeRowOpen.value;
      if (blockedByRow.value) scheduleOnRN(closeOpenSwipeRow);
    })
    .onUpdate((e) => {
      if (blockedByRow.value) return;
      drawerProgress.value = Math.min(1, Math.max(0, e.translationX / SIDEBAR_WIDTH));
    })
    .onEnd((e) => {
      if (blockedByRow.value) return;
      // A flick opens it from anywhere; otherwise it goes wherever it is nearer.
      const opening = e.velocityX > SWIPE_FLING || (e.velocityX >= 0 && drawerProgress.value > 0.5);
      if (opening) {
        drawerProgress.value = withTiming(1, {
          duration: DRAWER_OPEN_MS * (1 - drawerProgress.value),
          easing: DRAWER_OPEN_EASING,
        });
        // The drawer was never open as far as React knows, so this is what makes
        // it real — and what hands the panel its own interactivity back.
        scheduleOnRN(openDrawer);
        return;
      }
      // Abandoned. Nothing in React changed, so nothing else will put it back.
      drawerProgress.value = withTiming(0, {
        duration: DRAWER_CLOSE_MS * drawerProgress.value,
        easing: DRAWER_CLOSE_EASING,
      });
    });

  return (
    <View style={styles.row}>
      <GestureDetector gesture={swipeOpen}>
        <View style={styles.flex}>
          <Tabs />
          <UndoToast />
          {/* No column to give them, so the actions float over the list instead. */}
          {bulk && !wide && <BulkActions variant="bar" />}
        </View>
      </GestureDetector>
      {showPane && (
        <View style={styles.detailColumn}>
          {bulk || !openTaskId ? (
            <BulkActions variant="pane" />
          ) : (
            <TaskDetailView taskId={openTaskId} onClose={closeTask} variant="pane" />
          )}
        </View>
      )}
      {!wide && <TaskDetailSheet />}
      <ServerSheet visible={serverOpen} onClose={closeServer} />
      <NavSheets />
      <DragOverlay />
    </View>
  );
}

function Tabs() {
  const { wide } = useSidebar();

  if (Platform.OS !== 'web') return <NativeTabs />;

  // Labels and icons live in Sidebar, which is the only thing rendering the tab
  // list; `title` is kept because React Navigation uses it for the web page title.
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      /**
       * Web only. Every view has a URL (see App.tsx), but the browser only gains a
       * history entry for one if this navigator's own history grows with it — under
       * the default 'firstRoute' it never does, so Back would jump to All from
       * wherever you were and then leave the app. 'fullHistory' keeps repeat visits
       * distinct as well, which plain 'history' de-duplicates: with that, going All →
       * Today → All and pressing Back skips over the Today you just came from.
       *
       * Native keeps 'firstRoute': there, back is the Android system button, and
       * retracing a long trail of views before it exits isn't what that button means.
       */
      backBehavior={Platform.OS === 'web' ? 'fullHistory' : 'firstRoute'}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
      }}
    >
      <Tab.Screen name="AllTab" component={AllScreen} options={{ title: 'All' }} />
      <Tab.Screen name="InboxTab" component={InboxScreen} options={{ title: 'Inbox' }} />
      <Tab.Screen name="TodayTab" component={TodayScreen} options={{ title: 'Today' }} />
      <Tab.Screen name="CalendarTab" component={CalendarScreen} options={{ title: 'Calendar' }} />
      <Tab.Screen name="ActivityTab" component={ActivityScreen} options={{ title: 'Activity' }} />
      <Tab.Screen name="BrowseTab" component={BrowseScreen} options={{ title: 'Browse' }} />
      <Tab.Screen name="TrashTab" component={TrashScreen} options={{ title: 'Trash' }} />
    </Tab.Navigator>
  );
}

function NativeTabs() {
  const { wide } = useSidebar();
  const { selectedIds } = useSelection();
  const accent = useAccent();
  const Tabs = NativeTab;

  if (!Tabs) return null;

  return (
    <Tabs.Navigator
      initialRouteName="ListsTab"
      backBehavior="firstRoute"
      layout={({ children, state, navigation }) => (
        <NativeTabsLayout state={state} navigation={navigation}>
          {children}
        </NativeTabsLayout>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent,
        tabBarControllerMode: 'tabBar',
        tabBarMinimizeBehavior: 'none',
        tabBarStyle: { display: wide || selectedIds.length > 0 ? 'none' : 'flex' },
      }}
    >
      <Tabs.Screen
        name="ListsTab"
        component={NativeListNavigator}
        options={{
          title: 'Lists',
          tabBarLabel: Platform.OS === 'ios' ? '' : 'Lists',
          tabBarIcon: Platform.OS === 'ios'
            ? ({ focused }) => ({
                type: 'sfSymbol',
                name: focused ? 'checkmark.square.fill' : 'checkmark.square',
              })
            : undefined,
        }}
      />
      <Tabs.Screen
        name="InboxTab"
        component={InboxScreen}
        options={{
          title: 'Inbox',
          tabBarLabel: Platform.OS === 'ios' ? '' : 'Inbox',
          tabBarIcon: Platform.OS === 'ios'
            ? ({ focused }) => ({ type: 'sfSymbol', name: focused ? 'tray.fill' : 'tray' })
            : undefined,
        }}
      />
      <Tabs.Screen
        name="CalendarTab"
        component={CalendarScreen}
        options={{
          title: 'Calendar',
          tabBarLabel: Platform.OS === 'ios' ? '' : 'Calendar',
          tabBarIcon: Platform.OS === 'ios'
            ? { type: 'sfSymbol', name: 'calendar' }
            : undefined,
        }}
      />
      <Tabs.Screen
        name="BrowseTab"
        component={BrowseScreen}
        options={{
          title: 'Search',
          tabBarLabel: Platform.OS === 'ios' ? '' : 'Search',
          tabBarIcon: Platform.OS === 'ios'
            ? { type: 'sfSymbol', name: 'magnifyingglass' }
            : undefined,
        }}
      />
    </Tabs.Navigator>
  );
}

function NativeTabsLayout({
  children,
  state,
  navigation,
}: Pick<NativeBottomTabBarProps, 'state' | 'navigation'> & { children: React.ReactNode }) {
  const styles = useStyles();
  const { wide } = useSidebar();

  return (
    <View style={styles.nativeNavRow}>
      {wide && <Sidebar state={state} navigation={navigation} />}
      <View style={styles.flex}>{children}</View>
      {!wide && <SidebarDrawer state={state} navigation={navigation} />}
    </View>
  );
}

export const DETAIL_COLUMN_WIDTH = 380;

const useStyles = makeStyles((c) => ({
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  nativeNavRow: {
    flex: 1,
    flexDirection: 'row',
  },
  detailColumn: {
    width: DETAIL_COLUMN_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: c.border,
    backgroundColor: c.screenBg,
  },
}));

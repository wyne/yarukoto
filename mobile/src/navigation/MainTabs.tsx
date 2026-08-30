import React, { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BottomTabBar, BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeBottomTabNavigator,
  NativeBottomTabBarProps,
} from '@react-navigation/bottom-tabs/unstable';
import { NavigatorScreenParams } from '@react-navigation/native';
import { makeStyles } from '../theme/styles';
import { useAccent, useColors } from '../theme/ThemeContext';
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
import { drawerSwipeClaimed } from './drawerSwipe';
import SidebarDrawer from '../components/SidebarDrawer';
import TaskDetailView from '../components/TaskDetailView';
import TaskDetailSheet from '../components/TaskDetailSheet';
import BulkActions from '../components/BulkActions';
import { WEB_ENTRY } from '../data/platform';
import UndoToast from '../components/UndoToast';
import DragOverlay from '../drag/DragOverlay';
import { useDragActive } from '../drag/DragContext';
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
import { IconCalendar, IconClock, IconInboxTray, IconSearch, IconStack } from '../icons/Icons';
import { ANDROID_TAB_BAR_HEIGHT } from './nativeTabBarLayout';

const Tab = createBottomTabNavigator<MainTabParamList>();
type NativeMainTabParamList = {
  ListsTab: NavigatorScreenParams<NativeListStackParamList> | undefined;
  InboxTab: undefined;
  TodayTab: undefined;
  CalendarTab: undefined;
  BrowseTab: undefined;
};
const AndroidTab = createBottomTabNavigator<NativeMainTabParamList>();
const NativeTab = Platform.OS === 'ios'
  ? createNativeBottomTabNavigator<NativeMainTabParamList>()
  : null;

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
const DETAIL_COLUMN_MIN_WIDTH = 320;
const MAIN_CONTENT_MIN_WIDTH = 520;
const DETAIL_RESIZER_WIDTH = 11;

export default function MainTabs() {
  return (
    <SidebarProvider>
      <DetailProvider>
        <SelectionProvider>
          <Layout />
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
  const { wide, openDrawer, drawerProgress, serverOpen, closeServer } = useSidebar();
  const { openTaskId, closeTask } = useDetail();
  const { selectedIds } = useSelection();
  const [rowWidth, setRowWidth] = useState(0);
  const [detailColumnWidth, setDetailColumnWidth] = useState(DETAIL_COLUMN_WIDTH);
  const detailColumnWidthRef = useRef(detailColumnWidth);
  const resizeStartWidth = useRef(detailColumnWidth);

  // A selection takes the column over: the actions apply to several tasks, so
  // showing one task's detail beside them would only mislead about what the next
  // click is going to change.
  const bulk = WEB_ENTRY && selectedIds.length > 0;
  const showPane = wide && (bulk || !!openTaskId);

  const clampDetailColumnWidth = useCallback(
    (width: number) => {
      const max = rowWidth
        ? Math.max(DETAIL_COLUMN_MIN_WIDTH, rowWidth - MAIN_CONTENT_MIN_WIDTH - DETAIL_RESIZER_WIDTH)
        : DETAIL_COLUMN_WIDTH;
      return Math.min(Math.max(width, DETAIL_COLUMN_MIN_WIDTH), max);
    },
    [rowWidth]
  );
  const setClampedDetailColumnWidth = useCallback(
    (width: number) => {
      const next = clampDetailColumnWidth(width);
      detailColumnWidthRef.current = next;
      setDetailColumnWidth(next);
    },
    [clampDetailColumnWidth]
  );
  const detailResizePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => WEB_ENTRY,
        onMoveShouldSetPanResponder: () => WEB_ENTRY,
        onPanResponderGrant: () => {
          resizeStartWidth.current = detailColumnWidthRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          setClampedDetailColumnWidth(resizeStartWidth.current - gesture.dx);
        },
      }),
    [setClampedDetailColumnWidth]
  );
  const handleRowLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setRowWidth(nextWidth);
    if (!WEB_ENTRY) return;
    const max = Math.max(DETAIL_COLUMN_MIN_WIDTH, nextWidth - MAIN_CONTENT_MIN_WIDTH - DETAIL_RESIZER_WIDTH);
    if (detailColumnWidthRef.current > max) {
      detailColumnWidthRef.current = max;
      setDetailColumnWidth(max);
    }
  }, []);

  return (
    <View style={styles.row} onLayout={handleRowLayout}>
      <DrawerSwipeArea>
        <View style={styles.flex}>
          <Tabs />
          <UndoToast />
          {/* No column to give them, so the actions float over the list instead. */}
          {bulk && !wide && <BulkActions variant="bar" />}
        </View>
      </DrawerSwipeArea>
      {showPane && (
        <>
          {WEB_ENTRY && (
            <View
              style={styles.detailResizer}
              accessibilityRole="adjustable"
              accessibilityLabel="Resize task pane"
              {...detailResizePan.panHandlers}
            >
              <View style={styles.detailResizerLine} />
            </View>
          )}
          <View
            style={[
              styles.detailColumn,
              !WEB_ENTRY && styles.detailColumnBorder,
              WEB_ENTRY && { width: detailColumnWidth },
            ]}
          >
            {bulk || !openTaskId ? (
              <BulkActions variant="pane" />
            ) : (
              <TaskDetailView key={openTaskId} taskId={openTaskId} onClose={closeTask} variant="pane" />
            )}
          </View>
        </>
      )}
      {!wide && <TaskDetailSheet />}
      <ServerSheet visible={serverOpen} onClose={closeServer} />
      <NavSheets />
      <DragOverlay />
    </View>
  );
}

/**
 * Holds the swipe-to-open-drawer gesture, and nothing else.
 *
 * Its own component so that standing the gesture down costs one render of a
 * wrapper rather than one of the whole layout: `children` arrives as an element
 * that has not changed, so the tab tree under it is not re-rendered when a drag
 * starts.
 */
function DrawerSwipeArea({ children }: { children: React.ReactNode }) {
  const { wide, openDrawer, drawerProgress } = useSidebar();
  // A task being carried across the screen is the same rightward motion this
  // gesture is looking for, and gesture-handler cancels the touches under a
  // recognizer it activates (cancelsTouchesInView, on by default) — which
  // reaches the drag's pan responder as a termination and drops the task.
  // Blocking the *effect* in the callbacks below is not enough for that: the
  // recognizer still won the touch. So while a drag is in flight there is no
  // recognizer to win it.
  const dragging = useDragActive();

  /** Set for the length of a swipe something nearer the finger has a claim on. */
  const blocked = useSharedValue(false);

  /**
   * Swipe right anywhere in the app to pull the drawer out.
   *
   * Anywhere rather than from the edge, because rightward is free: a row swipes
   * left to reveal its actions and nothing swipes right, so the whole list is an
   * unclaimed surface for it. An edge strip was the cautious version of this and
   * it was hard to hit — a gesture you have to aim for is one you stop using.
   *
   * A screen whose own content is dragged rightward takes it back for as long as
   * it is in front — see `useClaimDrawerSwipe`. Being the whole screen is what
   * makes the gesture findable and also what makes it collide.
   *
   * The detector has to be out here rather than on the drawer. The drawer is in
   * a window of its own, and a separate window cannot pass a touch it does not
   * want back to the app beneath it, so a catcher over there would swallow
   * whatever it covered. In the app's own tree gesture-handler can arbitrate,
   * which is what leaves scrolling and tapping alone.
   */
  const swipeOpen = Gesture.Pan()
    // While open, the window overlay owns touches before they can reach this
    // detector, so React does not need to subscribe the whole layout to the
    // drawer's visibility merely to disable it.
    .enabled(SWIPE_TO_OPEN && !wide && !dragging)
    // Rightward only, so a row's own leftward swipe is never in the running.
    .activeOffsetX(SWIPE_ACTIVATE_X)
    .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
    .onStart(() => {
      // A rightward drag is also how an open row is shut, and that reading wins
      // — it is the nearer thing to the finger. Do it here rather than leave the
      // two gestures to fight over the touch, since this one may well have taken
      // it already. The screen in front gets the same right of way.
      blocked.value = swipeRowOpen.value || drawerSwipeClaimed.value;
      if (swipeRowOpen.value) scheduleOnRN(closeOpenSwipeRow);
    })
    .onUpdate((e) => {
      if (blocked.value) return;
      drawerProgress.value = Math.min(1, Math.max(0, e.translationX / SIDEBAR_WIDTH));
    })
    .onEnd((e) => {
      if (blocked.value) return;
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

  return <GestureDetector gesture={swipeOpen}>{children}</GestureDetector>;
}

function Tabs() {
  const { wide } = useSidebar();

  if (Platform.OS === 'ios') return <NativeTabs />;
  if (Platform.OS === 'android') return <AndroidTabs />;

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

function AndroidTabs() {
  const styles = useStyles();
  const { wide } = useSidebar();
  const { selectedIds } = useSelection();
  const accent = useAccent();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const barHidden = selectedIds.length > 0;

  return (
    <AndroidTab.Navigator
      initialRouteName="ListsTab"
      backBehavior="firstRoute"
      tabBar={(props) => {
        if (wide) return <Sidebar {...props} />;
        return (
          <>
            {!barHidden && <BottomTabBar {...props} />}
            <SidebarDrawer state={props.state} navigation={props.navigation} />
          </>
        );
      }}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: styles.androidTabLabel,
        tabBarStyle: [
          styles.androidTabBar,
          {
            height: ANDROID_TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: Math.max(8, insets.bottom),
          },
        ],
        tabBarItemStyle: styles.androidTabItem,
      }}
    >
      <AndroidTab.Screen
        name="ListsTab"
        component={NativeListNavigator}
        options={{
          title: 'Lists',
          tabBarLabel: 'Lists',
          tabBarIcon: ({ color, size }) => <IconStack size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <AndroidTab.Screen
        name="InboxTab"
        component={InboxScreen}
        options={{
          title: 'Inbox',
          tabBarLabel: 'Inbox',
          tabBarIcon: ({ color, size }) => <IconInboxTray size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <AndroidTab.Screen
        name="TodayTab"
        component={TodayScreen}
        options={{
          title: 'Today',
          tabBarLabel: 'Today',
          tabBarIcon: ({ color, size }) => <IconClock size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <AndroidTab.Screen
        name="CalendarTab"
        component={CalendarScreen}
        options={{
          title: 'Calendar',
          tabBarLabel: 'Calendar',
          tabBarIcon: ({ color, size }) => <IconCalendar size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <AndroidTab.Screen
        name="BrowseTab"
        component={BrowseScreen}
        options={{
          title: 'Search',
          tabBarLabel: 'Search',
          tabBarIcon: ({ color, size }) => <IconSearch size={size} color={color} strokeWidth={1.8} />,
        }}
      />
    </AndroidTab.Navigator>
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
        name="TodayTab"
        component={TodayScreen}
        options={{
          title: 'Today',
          tabBarLabel: Platform.OS === 'ios' ? '' : 'Today',
          tabBarIcon: Platform.OS === 'ios'
            ? ({ focused }) => ({ type: 'sfSymbol', name: focused ? 'clock.fill' : 'clock' })
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
  androidTabBar: {
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.surface,
    shadowColor: c.shadow,
    shadowOpacity: c.shadowOpacity,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 14,
  },
  androidTabItem: {
    paddingTop: 4,
  },
  androidTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  detailColumn: {
    width: DETAIL_COLUMN_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: c.screenBg,
  },
  detailColumnBorder: {
    borderLeftWidth: 1,
    borderLeftColor: c.border,
  },
  detailResizer: {
    width: DETAIL_RESIZER_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    backgroundColor: c.screenBg,
    ...({ cursor: 'col-resize', userSelect: 'none' } as object),
  },
  detailResizerLine: {
    width: 1,
    flex: 1,
    backgroundColor: c.border,
  },
}));

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  createNavigatorFactory,
  type DefaultNavigatorOptions,
  type EventMapBase,
  type ParamListBase,
  StackActions,
  StackRouter,
  type StackNavigationState,
  type StackRouterOptions,
  useNavigationBuilder,
  useTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

type Props = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  StackNavigationState<ParamListBase>,
  object,
  EventMapBase,
  unknown
> &
  StackRouterOptions;

/**
 * A stack with the native stack's router and none of its native views.
 *
 * On the Mac every native-stack screen is a UIKit view controller that reports
 * its own size back to React whenever the window moves, and each report is a
 * synchronous commit of the whole tree on the main thread. During a drag-resize
 * that is a full layout and mount per screen per frame, and it was most of what
 * the main thread did. Here a screen is a plain view filling its parent, so the
 * window's size reaches it through the surface's own layout, in the one commit
 * that has to happen anyway.
 *
 * The routes underneath stay mounted, as they do in the native stack, and are
 * `display: 'none'` — which drops them from layout and from the view hierarchy
 * without losing their state. Navigation actions, focus events and params all
 * come from React Navigation's `StackRouter`, so callers can't tell the
 * difference; there are no push animations or presentation styles, which a
 * desktop window has no use for. Screen options are accepted and ignored.
 */
function PlainStackNavigator({
  id,
  initialRouteName,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
  UNSTABLE_routeNamesChangeBehavior,
}: Props) {
  const { colors } = useTheme();
  const { state, descriptors, navigation, render } = useNavigationBuilder(StackRouter, {
    id,
    initialRouteName,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout,
    UNSTABLE_router,
    UNSTABLE_routeNamesChangeBehavior,
  });

  // Choosing the tab you're already in goes back to its first screen. The native
  // stack leaves that to UIKit's navigation controller, which this doesn't have.
  useEffect(
    () =>
      navigation.addListener?.('tabPress', (e: { defaultPrevented?: boolean }) => {
        const current = navigation.getState();
        if (navigation.isFocused() && current.index > 0 && !e.defaultPrevented) {
          navigation.dispatch({ ...StackActions.popToTop(), target: current.key });
        }
      }),
    [navigation]
  );

  return render(
    <View style={styles.host}>
      {state.routes.map((route, index) => (
        <View
          key={route.key}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }, index !== state.index && styles.hidden]}
        >
          {descriptors[route.key].render()}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  hidden: { display: 'none' },
});

const createPlainStack = createNavigatorFactory(PlainStackNavigator);

/**
 * Typed as the native stack, so the two can be swapped per platform behind one
 * `Stack` and its screens keep their options and params types.
 */
export function createPlainStackNavigator<ParamList extends ParamListBase>() {
  return createPlainStack() as unknown as ReturnType<typeof createNativeStackNavigator<ParamList>>;
}

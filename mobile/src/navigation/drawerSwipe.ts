import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { makeMutable } from 'react-native-reanimated';

/**
 * Whether the screen in front has claimed the rightward swipe for itself.
 *
 * Same shape as SwipeableRow's `swipeRowOpen`, and kept here for the same
 * reason: the drawer's gesture runs on the UI thread and cannot read a module
 * variable, so the answer is held somewhere it can.
 */
export const drawerSwipeClaimed = makeMutable(false);

/**
 * Stands the swipe-to-open-drawer gesture down while this screen is the one in
 * front.
 *
 * For a screen whose own content is dragged sideways. The drawer's swipe is
 * deliberately not an edge strip — it is the whole screen — which is free
 * anywhere nothing else moves rightward, and wrong on a surface where the thing
 * under the finger is a task being carried to a drop target. Losing that race
 * doesn't just misfire, it drops the task somewhere it wasn't aimed.
 *
 * Focus, not mount: tab screens stay mounted behind whichever one is showing, so
 * a screen that only gave the gesture back on unmount would hold it forever.
 */
export function useClaimDrawerSwipe() {
  useFocusEffect(
    useCallback(() => {
      drawerSwipeClaimed.value = true;
      return () => {
        drawerSwipeClaimed.value = false;
      };
    }, [])
  );
}

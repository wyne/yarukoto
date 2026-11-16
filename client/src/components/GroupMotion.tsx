import React, { useLayoutEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

const DURATION = 180;

interface Props {
  /** Off for a change of view, when every group would move at once. */
  animate: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A group of the web task list, which slides to its new place when a group above
 * it grows or folds. Web only: the native list is `VirtualTaskList`.
 *
 * It slides by position and nothing else. Reanimated's web layout transition
 * animates a change of box as a transform from the old one, scale included, so
 * the task pane opening beside the list drew every group at its old width
 * squeezed into the new one, text and all, and nested groups compounded it. A
 * change of width or height here just lands, and text is never drawn scaled.
 */
export function GroupMotion({ animate, style, children }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  // Where the group sat in the column at the last commit. `offsetTop` is the
  // layout position: scrolling and a slide still under way leave it alone.
  const lastTop = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.offsetTop;
    const from = lastTop.current;
    lastTop.current = top;
    if (!animate || from === null || from === top || reducedMotion()) return;
    el.animate?.([{ transform: `translateY(${from - top}px)` }, { transform: 'translateY(0)' }], {
      duration: DURATION,
      easing: 'ease',
    });
  });

  return (
    <View ref={ref as never} style={style}>
      {children}
    </View>
  );
}

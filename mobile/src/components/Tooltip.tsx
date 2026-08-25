import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { FINE_POINTER } from '../data/platform';

interface Props {
  /** What the control does, in a word or two. */
  label: string;
  /**
   * Which edge of the trigger the bubble lines up with. Buttons near the right
   * of a header want 'end', or the bubble runs off the window.
   */
  align?: 'start' | 'center' | 'end';
  /**
   * Which side of the trigger the bubble sits on. A control near the bottom of
   * the window wants 'above', or the bubble is pushed off screen.
   */
  placement?: 'below' | 'above';
  children: React.ReactNode;
}

/** Long enough that sweeping the pointer across a row of buttons stays quiet. */
const DELAY = 450;

/**
 * Names an icon button on hover.
 *
 * Pointer-only: there is no hover to trigger it on a touchscreen, and a tooltip
 * that appears on tap would just be in the way of the thing it describes.
 */
export default function Tooltip({ label, align = 'end', placement = 'below', children }: Props) {
  const styles = useStyles();
  const ref = useRef<View>(null);
  const [shown, setShown] = useState(false);

  // Listened for on the host node rather than a Pressable, so the trigger keeps
  // whatever press behaviour it already had and this stays a pure wrapper.
  useEffect(() => {
    if (!FINE_POINTER) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const enter = () => {
      timer = setTimeout(() => setShown(true), DELAY);
    };
    const leave = () => {
      clearTimeout(timer);
      setShown(false);
    };

    node.addEventListener('pointerenter', enter);
    node.addEventListener('pointerleave', leave);
    // A tooltip left hanging over a menu the click just opened is pure noise.
    node.addEventListener('pointerdown', leave);
    return () => {
      clearTimeout(timer);
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointerleave', leave);
      node.removeEventListener('pointerdown', leave);
    };
  }, []);

  // Nothing to anchor without a pointer to hover: touch builds skip the wrapper
  // rather than nest the trigger a level deeper for a bubble that never shows.
  if (!FINE_POINTER) return <>{children}</>;

  return (
    <View ref={ref} style={styles.wrap}>
      {children}
      {shown && (
        // Never a hit target: hovering the bubble must not count as hovering the
        // button, or it would flicker as the pointer crosses onto it.
        <View
          pointerEvents="none"
          style={[styles.bubble, ALIGN[align], placement === 'above' ? styles.above : styles.below]}
        >
          <Text style={styles.text} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

const ALIGN = StyleSheet.create({
  start: { left: 0 },
  center: { left: '50%', transform: [{ translateX: '-50%' }] },
  end: { right: 0 },
});

const useStyles = makeStyles((c) => ({
  wrap: {
    position: 'relative',
  },
  bubble: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: c.inverseSurface,
    boxShadow: `0 4px 12px ${c.shadow}${Math.round(c.shadowOpacity * 255).toString(16).padStart(2, '0')}`,
    zIndex: 10,
  },
  below: {
    top: '100%',
    marginTop: 8,
  },
  above: {
    bottom: '100%',
    marginBottom: 8,
  },
  text: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: c.inverseText,
  },
}));

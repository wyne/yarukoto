import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import ThemedGlassView from './ThemedGlassView';
import EscapeToClose from './EscapeToClose';
import { LIQUID_GLASS } from '../data/platform';
import { makeStyles } from '../theme/styles';
import { placePopover, POPOVER_EDGE as EDGE, type PopoverAnchor } from './popoverPlacement';

export type { PopoverAnchor };

/**
 * Measures the control a press landed on, for a popover to tether to. Hands back
 * null where the target can't be measured, which callers treat as "no anchor".
 */
export function measureAnchor(e: { currentTarget: unknown }, then: (anchor: PopoverAnchor | null) => void) {
  const node = e.currentTarget as {
    measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
  } | null;
  if (node?.measureInWindow) {
    node.measureInWindow((x, y, width, height) => then({ x, y, width, height }));
  } else {
    then(null);
  }
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Measured from the trigger with `measureInWindow`. */
  anchor: PopoverAnchor | null;
  width?: number;
  /**
   * Which edge lines up with the anchor. Header buttons want 'end', so the panel
   * hangs back under the control; a context menu wants 'start', so it opens away
   * from the pointer the way one always has.
   */
  align?: 'start' | 'end';
  /**
   * Render into the current view instead of a Modal of its own.
   *
   * For the one case a Modal cannot serve: a popover opened from inside another
   * Modal. iOS presents a Modal as its own view controller, and a second one
   * presented from within the first does not come up at all — which is what the
   * nav drawer is. Inline mode draws the same panel as an absolutely positioned
   * overlay in the host view, so it needs the host to fill the area the panel
   * should be placed against.
   */
  inline?: boolean;
  /** Inline mode: the host's size, used for placement instead of the window's. */
  bounds?: { width: number; height: number };
  children: React.ReactNode;
}

/**
 * Below this a touch-screen browser is probably a phone, where the panel would
 * cover most of the screen and a bottom sheet is the better shape — a tethered
 * panel only reads as one when there is visibly a page behind it. A narrow
 * window driven by a mouse is still a desktop window, so the Mac and a
 * fine-pointer browser ignore this; see `useDesktopPresentation`.
 */
export const POPOVER_MIN_WIDTH = 600;

/**
 * A panel tethered to the control that opened it, for pointer-driven layouts
 * where a bottom sheet is the wrong shape — it travels the full height of the
 * window to answer a question asked in the top corner.
 *
 * Aligned to one edge of its anchor and kept inside the window: see
 * `placePopover`. An anchor with no size is a point, which is how a context menu
 * opens at the pointer.
 */
export default function Popover({
  visible,
  onClose,
  anchor,
  width: preferred = 380,
  align = 'end',
  inline,
  bounds,
  children,
}: Props) {
  const styles = useStyles();
  const window = useWindowDimensions();
  const { width: winWidth, height: winHeight } = bounds ?? window;
  // Narrow windows get whatever is available rather than an overflowing card.
  const width = Math.min(preferred, winWidth - EDGE * 2);

  // The panel's own height, measured once it lays out, since only the content
  // knows it. Until then the panel is drawn but invisible, so it never shows a
  // frame in the wrong place; a closed popover forgets it, since the next one
  // may hold something else.
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!visible || !anchor) setHeight(null);
  }, [visible, anchor]);

  if (!anchor) return null;

  const { left, top } = placePopover({
    anchor,
    width,
    height: height ?? 0,
    bounds: { width: winWidth, height: winHeight },
    align,
  });

  const place = [{ width, left, top }, height === null && { opacity: 0 }];
  const measure = (e: { nativeEvent: { layout: { height: number } } }) => setHeight(e.nativeEvent.layout.height);

  // Escape closes, as it would for any other dismissible layer on a desktop.
  const body = (
    <EscapeToClose active={visible} onEscape={onClose} inModal={!inline} style={StyleSheet.absoluteFill}>
      {/* Catches the click-away. Transparent, so the page stays readable behind
          it — a popover is a light touch, not a modal interruption. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      {LIQUID_GLASS ? (
        /*
         * The system material, so the panel reads as one of the OS's own menus
         * rather than a card the app drew: it refracts and tints from whatever
         * it is over, which a fixed surface colour cannot do.
         *
         * It brings its own edge and shading, so the card's border and shadow
         * come off — layering ours on top is what makes glass look like a
         * sticker of glass. `isInteractive` stays off: that is for controls that
         * morph under a finger, and this is a surface things sit on.
         */
        <ThemedGlassView
          glassEffectStyle="regular"
          style={[styles.card, styles.glassCard, place]}
          onLayout={measure}
        >
          {children}
        </ThemedGlassView>
      ) : (
        <View style={[styles.card, place]} onLayout={measure}>
          {children}
        </View>
      )}
    </EscapeToClose>
  );

  if (inline) return visible ? body : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    position: 'absolute',
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    boxShadow: `0 12px 32px ${c.shadow}${c.shadowOpacity ? '2E' : '00'}`,
  },
  /** Overrides the flat card's own surface. See the glass branch above. */
  glassCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    boxShadow: undefined,
    // Matches the corner the system rounds its own menus to, which is tighter
    // than the app's cards.
    borderRadius: 14,
    overflow: 'hidden',
  },
}));

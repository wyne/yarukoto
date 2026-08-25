import React, { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { LIQUID_GLASS } from '../data/platform';
import { makeStyles } from '../theme/styles';

/** Where the control that opened the popover sits, in window coordinates. */
export interface PopoverAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
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

const MARGIN = 8;
const EDGE = 12;

/**
 * Below this the panel would cover most of the window, at which point a bottom
 * sheet is the better shape — a tethered panel only reads as one when there is
 * visibly a page behind it.
 */
export const POPOVER_MIN_WIDTH = 600;

/**
 * A panel tethered to the control that opened it, for pointer-driven layouts
 * where a bottom sheet is the wrong shape — it travels the full height of the
 * window to answer a question asked in the top corner.
 *
 * Aligned to one edge of its anchor and flipped above it when there isn't room
 * below. An anchor with no size is a point, which is how a context menu opens
 * at the pointer.
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

  // Escape closes, as it would for any other dismissible layer on a desktop.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!anchor) return null;

  // Aligned to the requested edge, then pulled back inside the window if that
  // would overflow it.
  const wanted = align === 'start' ? anchor.x : anchor.x + anchor.width - width;
  const left = Math.min(Math.max(EDGE, wanted), Math.max(EDGE, winWidth - width - EDGE));
  const below = anchor.y + anchor.height + MARGIN;
  const spaceBelow = winHeight - below - EDGE;
  const flip = spaceBelow < 200 && anchor.y > spaceBelow;

  const place = [
    { width, left },
    flip ? { bottom: winHeight - anchor.y + MARGIN } : { top: below },
  ];

  const body = (
    <>
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
        <GlassView glassEffectStyle="regular" style={[styles.card, styles.glassCard, place]}>
          {children}
        </GlassView>
      ) : (
        <View style={[styles.card, place]}>{children}</View>
      )}
    </>
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

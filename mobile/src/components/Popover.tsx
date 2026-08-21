import React, { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';

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
  children,
}: Props) {
  const { width: winWidth, height: winHeight } = useWindowDimensions();
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Catches the click-away. Transparent, so the page stays readable behind
          it — a popover is a light touch, not a modal interruption. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        style={[
          styles.card,
          { width, left },
          flip ? { bottom: winHeight - anchor.y + MARGIN } : { top: below },
        ]}
      >
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
  },
});

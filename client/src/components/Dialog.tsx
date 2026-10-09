import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import EscapeToClose from './EscapeToClose';
import { makeStyles } from '../theme/styles';
import { useColors } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called once the dialog has been presented — the moment to focus an input. */
  onShow?: () => void;
  width?: number;
  /**
   * Keeps the card at least this tall, for content that changes as you use it —
   * a settings window's tabs — so its title and tabs stay put rather than
   * jumping with every switch. Still capped by the window.
   */
  minHeight?: number;
  /** Drawn above the body and kept in place while the body scrolls. */
  header?: React.ReactNode;
  children: React.ReactNode;
}

const EDGE = 12;
const MARGIN_Y = 48;

/**
 * A panel centred over a dimmed window, for desktop content that wasn't opened
 * from a particular control — settings, naming a new list — and so has nothing
 * to be tethered to.
 *
 * The desktop counterpart of a bottom sheet, which travels the full height of a
 * window from its bottom edge: the right gesture under a thumb, and nowhere near
 * where a pointer is. Click-away and Escape close it, as they close any other
 * desktop layer.
 */
export default function Dialog({ visible, onClose, onShow, width: preferred = 440, minHeight, header, children }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const window = useWindowDimensions();
  // A window narrower than the dialog gets the room it has, not an overflowing card.
  const width = Math.min(preferred, window.width - EDGE * 2);
  const maxHeight = Math.max(200, window.height - MARGIN_Y * 2);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={onShow}>
      <EscapeToClose active={visible} onEscape={onClose} inModal style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: colors.scrimOpacity }]}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View style={[styles.card, { width, maxHeight, minHeight: minHeight ? Math.min(minHeight, maxHeight) : undefined }]}>
          {header}
          {/* Grows to its content, and scrolls only once that passes the cap. */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </EscapeToClose>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    paddingTop: 16,
    boxShadow: `0 20px 48px ${c.shadow}${c.shadowOpacity ? '40' : '00'}`,
    overflow: 'hidden',
  },
  // Content height until the card's cap, then it gives way and scrolls.
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
}));

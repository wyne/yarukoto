import React, { useState } from 'react';
import { makeStyles } from '../theme/styles';
import { Pressable, StyleSheet, View } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '../theme/ThemeContext';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { nativeTabBarClearance } from '../navigation/nativeTabBarLayout';
import { LIQUID_GLASS } from '../data/platform';
import { QuickAddDefaults } from '../data/TaskContext';
import TaskComposerSheet from './TaskComposerSheet';
import { IconPlusBig } from '../icons/Icons';

interface Props {
  /** What the view contributes to a new task — list, tag or date scope. */
  defaults?: QuickAddDefaults;
  contextLabel?: string;
  /** Selection mode puts its own bar at the bottom; the button would sit on top of it. */
  hidden?: boolean;
}

/**
 * The native task-entry point: a floating button that opens the composer.
 *
 * Owns the composer's open state so a screen mounts one element. Web keeps the
 * pinned QuickAddBar instead — a keyboard-driven session wants a field it can
 * type into without a tap first.
 */
export default function AddTaskFab({ defaults, contextLabel, hidden }: Props) {
  const styles = useStyles();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { wide } = useSidebar();
  const [open, setOpen] = useState(false);

  return (
    <>
      {!hidden && (
        // Capped to the same width the screens cap their content at, so on a wide
        // window the button tracks the right edge of the list rather than drifting
        // out into the dead space beside it.
        <View
          style={[
            styles.anchor,
            { bottom: wide ? insets.bottom + 20 : nativeTabBarClearance(insets.bottom) },
          ]}
          pointerEvents="box-none"
        >
          <Pressable onPress={() => setOpen(true)} accessibilityLabel="New task">
            {LIQUID_GLASS ? (
              // Tinted rather than clear: the button is the one thing on the
              // screen that has to stay findable while the list scrolls under it,
              // and the accent is what makes it findable.
              <GlassView style={styles.fab} tintColor={accent} isInteractive>
                <IconPlusBig size={24} color="#fff" strokeWidth={2.2} />
              </GlassView>
            ) : (
              <View style={[styles.fab, styles.fabFlat, { backgroundColor: accent }]}>
                <IconPlusBig size={24} color="#fff" strokeWidth={2.2} />
              </View>
            )}
          </Pressable>
        </View>
      )}

      <TaskComposerSheet
        visible={open}
        onClose={() => setOpen(false)}
        defaults={defaults}
        contextLabel={contextLabel}
      />
    </>
  );
}

const useStyles = makeStyles((c) => ({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    maxWidth: PANE_MAX_WIDTH,
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Glass lifts itself off the background; a flat disc needs the shadow to. */
  fabFlat: {
    shadowColor: c.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
}));

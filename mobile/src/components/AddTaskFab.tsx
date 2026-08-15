import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '../theme/ThemeContext';
import { PANE_MAX_WIDTH } from '../navigation/SidebarContext';
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
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      {!hidden && (
        // Capped to the same width the screens cap their content at, so on a wide
        // window the button tracks the right edge of the list rather than drifting
        // out into the dead space beside it.
        <View
          style={[styles.anchor, { bottom: insets.bottom + 20 }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => setOpen(true)}
            style={[styles.fab, { backgroundColor: accent }]}
            accessibilityLabel="New task"
          >
            <IconPlusBig size={24} color="#fff" strokeWidth={2.2} />
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

const styles = StyleSheet.create({
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
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
});

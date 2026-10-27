import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Pressable from './HoverPressable';
import Dialog from './Dialog';
import MacMenu from '../../modules/mac-menu/src/MacMenu';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useTasks } from '../data/TaskContext';
import { activeLists, isTrashed } from '../data/selectors';
import { MAC, MAC_KEYS } from '../data/platform';
import { useDetail } from '../navigation/DetailContext';
import { useShowTask } from '../navigation/showTask';
import {
  SWITCHER_CLOSED,
  SwitcherState,
  noteSwitchedTo,
  recentTaskIds,
  stepSwitcher,
  switcherList,
  taskOpened,
} from '../navigation/recentTasks';

/**
 * ⌃Tab: the tasks you have had open, most recent first, to go back to one.
 *
 * Holding ⌃ does nothing on its own. The first ⌃Tab shows the list with the
 * open task at the top and the one before it chosen; more Tabs move down,
 * ⌃⇧Tab or ⌃` up, and letting go of ⌃ opens the chosen task — so a quick ⌃Tab
 * goes straight back to the last one. Escape or a click away puts it away.
 *
 * The desktop apps only. A browser keeps ⌃Tab for its own tabs.
 */
export default function TaskSwitcher() {
  const styles = useStyles();
  const { state } = useTasks();
  const { openTaskId } = useDetail();
  const showTask = useShowTask();
  const [switcher, setSwitcher] = useState<SwitcherState>(SWITCHER_CLOSED);

  useEffect(() => taskOpened(openTaskId), [openTaskId]);

  const byId = useMemo(() => new Map(state.tasks.map((t) => [t.id, t])), [state.tasks]);
  const listName = useMemo(() => new Map(activeLists(state.lists).map((l) => [l.id, l.name])), [state.lists]);

  // Read by the key handlers, which outlive any one render.
  const latest = useRef({ switcher, openTaskId, byId, showTask });
  latest.current = { switcher, openTaskId, byId, showTask };

  const step = useCallback((delta: 1 | -1) => {
    const { switcher: now, openTaskId: open, byId: tasks } = latest.current;
    const isLive = (id: string) => {
      const task = tasks.get(id);
      return !!task && !task.completed && !isTrashed(task);
    };
    const next = stepSwitcher(now, delta, switcherList(open, recentTaskIds(), isLive), open);
    latest.current.switcher = next;
    setSwitcher(next);
  }, []);

  const go = useCallback((id: string | undefined) => {
    latest.current.switcher = SWITCHER_CLOSED;
    setSwitcher(SWITCHER_CLOSED);
    if (!id || id === latest.current.openTaskId) return;
    noteSwitchedTo(id);
    latest.current.showTask(id);
  }, []);

  const release = useCallback(() => {
    const { list, index } = latest.current.switcher;
    if (list.length > 0) go(list[index]);
  }, [go]);

  const cancel = useCallback(() => go(undefined), [go]);

  useEffect(() => {
    if (MAC) {
      const steps = MacMenu?.addListener('onSwitcherStep', ({ step: delta }) => step(delta < 0 ? -1 : 1));
      const releases = MacMenu?.addListener('onSwitcherRelease', release);
      return () => {
        steps?.remove();
        releases?.remove();
      };
    }
    if (Platform.OS !== 'web') return;
    // The Windows app. Captured, as react-native-web's fields stop keys from bubbling.
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.metaKey || e.altKey) return;
      const grave = e.code === 'Backquote';
      if (e.key !== 'Tab' && !grave) return;
      e.preventDefault();
      e.stopPropagation();
      step(e.shiftKey || grave ? -1 : 1);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') release();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    // ⌃ let go in another window never comes back as a key up here.
    window.addEventListener('blur', cancel);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', cancel);
    };
  }, [step, release, cancel]);

  return (
    <Dialog visible={switcher.list.length > 0} onClose={cancel} fade={false} width={440}>
      <Text style={styles.heading} accessibilityRole="header">
        Recent Tasks
      </Text>
      {switcher.list.map((id, i) => {
        const task = byId.get(id);
        const where = task ? (task.listId === null ? 'Inbox' : listName.get(task.listId)) : undefined;
        return (
          <Pressable
            key={id}
            onPress={() => go(id)}
            style={[styles.row, i === switcher.index && styles.rowSelected]}
            accessibilityState={{ selected: i === switcher.index }}
          >
            <Text style={styles.title} numberOfLines={1}>
              {task?.title.trim() || 'Untitled'}
            </Text>
            {!!where && <Text style={styles.where}>{where}</Text>}
          </Pressable>
        );
      })}
      <View style={styles.footer}>
        <Text style={styles.hint}>{MAC_KEYS ? 'Let go of ⌃ to open it, or press ⎋' : 'Let go of Ctrl to open it, or press Esc'}</Text>
      </View>
    </Dialog>
  );
}

const useStyles = makeStyles((c) => ({
  heading: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 7,
  },
  rowSelected: {
    backgroundColor: c.selectedRowBg,
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
  },
  where: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  footer: {
    marginTop: 8,
    paddingHorizontal: 8,
  },
  hint: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
}));

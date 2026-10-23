import { useEffect, useRef, useState } from 'react';
import { statusMenuContents } from '../data/macStatusMenu';
import { useTasks } from '../data/TaskContext';
import { onTrayAction, setTaskbarBadge, setTrayTasks } from '../data/windowsTray';
import { useShowTask } from './showTask';
import { dispatchCommand } from './MenuCommands';

/** How often Today is worked out again with nothing changed, so midnight moves it on. */
const RECHECK_MS = 60_000;

/**
 * Keeps the Windows app's notification area icon in step with the tasks:
 * Today's list for its menu, the count for its tooltip and the taskbar badge,
 * and the menu's choices answered here. The Windows counterpart of
 * `MacStatusMenu`, fed by the same `statusMenuContents`.
 *
 * Mounted with the main layout, which stays mounted while the window is hidden
 * in the notification area: closing hides the window rather than tearing it
 * down. WebView2 slows a hidden page's timers to about once a minute, which
 * the recheck and sync can live with.
 */
export default function WindowsTrayMenu() {
  const { state, toggleComplete } = useTasks();
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setMinute((m) => m + 1), RECHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const sent = useRef('');
  const badge = useRef(0);
  useEffect(() => {
    const contents = statusMenuContents(state.tasks, new Date());
    const key = JSON.stringify(contents);
    if (key === sent.current) return;
    sent.current = key;
    setTrayTasks(contents).catch(() => {});
    if (contents.count !== badge.current) {
      badge.current = contents.count;
      setTaskbarBadge(contents.count).catch(() => {});
    }
  }, [state.tasks, minute]);

  // Hiding the window takes its taskbar button away, and the badge with it,
  // so it goes back on whenever the window comes back.
  useEffect(() => {
    const restore = () => {
      if (document.visibilityState === 'visible' && badge.current > 0) {
        setTaskbarBadge(badge.current).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', restore);
    return () => document.removeEventListener('visibilitychange', restore);
  }, []);

  // Unmounted when the app leaves the account for the first-run screen
  // (disconnect, a revoked sign-in): the icon mustn't keep that account's
  // titles and count, nor rows that would no longer do anything.
  useEffect(
    () => () => {
      sent.current = '';
      badge.current = 0;
      setTrayTasks(null).catch(() => {});
      setTaskbarBadge(0).catch(() => {});
    },
    []
  );

  const showTask = useShowTask();
  const latest = useRef({ tasks: state.tasks, toggleComplete, showTask });
  latest.current = { tasks: state.tasks, toggleComplete, showTask };
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let unmounted = false;
    onTrayAction((event) => {
      switch (event.action) {
        case 'openTask':
          latest.current.showTask(event.taskId);
          break;
        case 'complete': {
          // The menu can be a sync behind; toggling a task already done would undo it.
          const task = latest.current.tasks.find((t) => t.id === event.taskId);
          if (task && !task.completed) latest.current.toggleComplete(task.id);
          break;
        }
        case 'newTask':
          dispatchCommand('newTask');
          break;
        case 'settings':
          dispatchCommand('settings');
          break;
        case 'today':
          dispatchCommand('goToday');
          break;
      }
    }).then(
      (stop) => {
        if (unmounted) stop();
        else unlisten = stop;
      },
      () => {}
    );
    return () => {
      unmounted = true;
      unlisten?.();
    };
  }, []);

  return null;
}

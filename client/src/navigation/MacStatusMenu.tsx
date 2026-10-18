import { useEffect, useRef, useState } from 'react';
import MacStatusItem from '../../modules/mac-status-item/src/MacStatusItem';
import { statusMenuContents } from '../data/macStatusMenu';
import { MAC } from '../data/platform';
import { useTasks } from '../data/TaskContext';
import { dispatchCommand, useCommand } from './MenuCommands';

const closeWindow = () => {
  MacStatusItem?.closeMainWindow();
};

/** How often Today is worked out again with nothing changed, so midnight moves it on. */
const RECHECK_MS = 60_000;

/**
 * Keeps the Mac's menu bar extra in step with the tasks: Today's list and its
 * count, sent whenever either changes, and the menu's choices answered here.
 *
 * The icon and its Open, New Task and Quit items are up before this runs — the
 * native side puts them there at launch — so all this adds is Today. Mounted
 * with the main layout, which stays mounted while the window is closed to the
 * menu bar: closing hides the window rather than tearing it down.
 */
export default function MacStatusMenu() {
  const { state, toggleComplete } = useTasks();
  const [minute, setMinute] = useState(0);

  // File ▸ Close, ⌘W. Native decides whether that hides or quits.
  useCommand('closeWindow', closeWindow, !!MacStatusItem);

  useEffect(() => {
    if (!MAC || !MacStatusItem) return;
    const timer = setInterval(() => setMinute((m) => m + 1), RECHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const sent = useRef('');
  useEffect(() => {
    if (!MAC || !MacStatusItem) return;
    const contents = statusMenuContents(state.tasks, new Date());
    const key = JSON.stringify(contents);
    if (key === sent.current) return;
    sent.current = key;
    MacStatusItem.setTasks(contents.tasks, contents.more, contents.count);
  }, [state.tasks, minute]);

  const latest = useRef({ tasks: state.tasks, toggleComplete });
  latest.current = { tasks: state.tasks, toggleComplete };
  useEffect(() => {
    if (!MAC || !MacStatusItem) return;
    const subscription = MacStatusItem.addListener('onAction', (event) => {
      switch (event.action) {
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
    });
    return () => subscription.remove();
  }, []);

  return null;
}

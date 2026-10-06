import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Task } from '../data/types';

const DRAFT_COMMIT_MS = 500;
/**
 * How long typing has to stop before the hold lifts and the edit syncs. Without
 * it the hold lasts as long as the editor, which is fine for a sheet that gets
 * dismissed but means never in the wide-layout pane, where the editor stays open
 * until another task is picked.
 */
const IDLE_RELEASE_MS = 3000;

interface Params {
  taskId: string;
  task: Task | undefined;
  active: boolean;
  updateTask: (id: string, patch: Partial<Task>) => void;
  beginTaskEdit: (id: string) => void;
  endTaskEdit: (id: string) => void;
}

interface Draft {
  title: string;
  notes: string;
}

/**
 * Keeps high-frequency text input out of the global task collection while
 * preserving the existing local snapshot and sync durability after a short
 * pause. The task is held from server pushes while the user is typing, so a
 * burst of local saves becomes one revision; the hold lifts once typing pauses
 * for `IDLE_RELEASE_MS`, or when the editor closes, whichever comes first.
 */
export function useTaskTextDraft({
  taskId,
  task,
  active,
  updateTask,
  beginTaskEdit,
  endTaskEdit,
}: Params) {
  const initial = { title: task?.title ?? '', notes: task?.notes ?? '' };
  const [draft, setDraft] = useState<Draft>(initial);
  const draftRef = useRef(initial);
  const taskRef = useRef(task);
  const dirtyRef = useRef({ title: false, notes: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const activeRef = useRef(active);

  taskRef.current = task;
  activeRef.current = active;

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  const hold = useCallback(() => {
    if (heldRef.current) return;
    heldRef.current = true;
    beginTaskEdit(taskId);
  }, [beginTaskEdit, taskId]);

  // Lifts the hold without flushing, for callers that just flushed.
  const unhold = useCallback(() => {
    clearIdleTimer();
    if (!heldRef.current) return;
    heldRef.current = false;
    endTaskEdit(taskId);
  }, [clearIdleTimer, endTaskEdit, taskId]);

  const flush = useCallback(() => {
    clearTimer();
    const current = taskRef.current;
    if (!current || current.id !== taskId) return;

    const patch: Partial<Task> = {};
    if (dirtyRef.current.title && draftRef.current.title !== current.title) {
      patch.title = draftRef.current.title;
    }
    if (dirtyRef.current.notes && draftRef.current.notes !== current.notes) {
      patch.notes = draftRef.current.notes;
    }
    dirtyRef.current = { title: false, notes: false };
    if (Object.keys(patch).length > 0) updateTask(taskId, patch);
    clearIdleTimer();
    idleTimerRef.current = setTimeout(unhold, IDLE_RELEASE_MS);
  }, [clearIdleTimer, clearTimer, taskId, unhold, updateTask]);

  const scheduleFlush = useCallback(() => {
    clearTimer();
    clearIdleTimer();
    // Typing again after an idle release takes the hold back.
    if (activeRef.current && AppState.currentState === 'active') hold();
    timerRef.current = setTimeout(flush, DRAFT_COMMIT_MS);
  }, [clearIdleTimer, clearTimer, flush, hold]);

  const setTitle = useCallback((title: string) => {
    const next = { ...draftRef.current, title };
    draftRef.current = next;
    dirtyRef.current.title = title !== taskRef.current?.title;
    setDraft(next);
    scheduleFlush();
  }, [scheduleFlush]);

  const setNotes = useCallback((notes: string) => {
    const next = { ...draftRef.current, notes };
    draftRef.current = next;
    dirtyRef.current.notes = notes !== taskRef.current?.notes;
    setDraft(next);
    scheduleFlush();
  }, [scheduleFlush]);

  // Pull clean fields forward when this task changes elsewhere. A local field
  // under the cursor wins until its draft is flushed.
  useEffect(() => {
    if (!task || task.id !== taskId) return;
    setDraft((current) => {
      const next = {
        title: dirtyRef.current.title ? current.title : task.title,
        notes: dirtyRef.current.notes ? current.notes : task.notes,
      };
      draftRef.current = next;
      return next.title === current.title && next.notes === current.notes ? current : next;
    });
  }, [taskId, task?.title, task?.notes]);

  const release = useCallback(() => {
    flush();
    unhold();
  }, [flush, unhold]);

  // A hidden sheet remains mounted for its closing animation, so `active`, not
  // mount state alone, defines the edit session.
  useEffect(() => {
    if (!active || AppState.currentState !== 'active') return;
    hold();
    return release;
  }, [active, hold, release]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && active) hold();
      else release();
    });
    return () => subscription.remove();
  }, [active, hold, release]);

  useEffect(() => () => {
    clearTimer();
    release();
  }, [clearTimer, release]);

  return {
    title: draft.title,
    notes: draft.notes,
    setTitle,
    setNotes,
    flush,
  };
}

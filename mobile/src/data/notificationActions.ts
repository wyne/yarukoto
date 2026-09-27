import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The contract between a reminder notification's action buttons and the app.
 *
 * Tapping "Done" on a lock-screen notification has to work when the app is
 * backgrounded *or killed*, which is the whole difficulty. Expo's response
 * listeners only exist once the JS bundle is running, so on iOS the action is
 * caught natively (see modules/notification-actions) and left here as a pending
 * entry for JS to reconcile the next time it runs. Android has no such gap: its
 * headless task boots the real bundle, so it takes the same path as a tap in the
 * foreground.
 *
 * The identifiers below are duplicated in Swift and must not drift. They are
 * also baked into scheduled notifications that may already be sitting in the
 * system's queue, so treat them as permanent.
 */

/**
 * The Android half of the queue the iOS handler keeps in UserDefaults.
 *
 * Android's headless task boots the real JS bundle, so it *could* drive the
 * whole sync engine from here. It deliberately does not: doing so would mean a
 * second orchestrator racing the foreground app's own sync loop, and two places
 * that know how to push. Writing the intent down and letting the app fold it in
 * on next launch is the same shape as iOS, which leaves one drain path to reason
 * about instead of two.
 *
 * Read and written through AsyncStorage directly rather than the storage module,
 * because a headless task starts a fresh JS context where that module's cache
 * was never primed.
 */
export const PENDING_ACTIONS_KEY = 'yarukoto.pendingNotificationActions';

/** Must contain no ':' or '-' — expo warns that categories misbehave otherwise. */
export const TASK_REMINDER_CATEGORY_ID = 'taskReminder';

export const COMPLETE_ACTION_ID = 'complete';
export const SNOOZE_ACTION_ID = 'snooze';

export const SNOOZE_DURATION_MS = 60 * 60 * 1000;

/**
 * Snoozed re-notifications carry their own prefix so the reconciler can tell
 * them from the reminders it derives from task data. It owns both — see
 * buildTaskReminderNotificationRequests — but they are built from different
 * sources, and a shared prefix would let a stale snooze masquerade as a reminder.
 */
export const TASK_SNOOZE_NOTIFICATION_PREFIX = 'yarukoto:taskSnooze:';

export function taskSnoozeNotificationIdentifier(taskId: string, reminderId: string): string {
  return `${TASK_SNOOZE_NOTIFICATION_PREFIX}${taskId}:${reminderId}`;
}

/** A reminder pushed forward on this device only. Never synced: a snooze is a
 * statement about one phone's notifications, not about the task. */
export interface SnoozedReminder {
  taskId: string;
  reminderId: string;
  /** ISO timestamp the replacement notification is set to fire. */
  fireAt: string;
}

/** An action taken while JS was not running, waiting to be folded into state. */
export interface PendingNotificationAction {
  action: typeof COMPLETE_ACTION_ID | typeof SNOOZE_ACTION_ID;
  taskId: string;
  reminderId: string;
  /** ISO timestamp of the tap — not of the drain, which may be hours later. */
  at: string;
  /** Snooze only: when the replacement notification was scheduled for. */
  fireAt?: string;
}

function isActionId(value: unknown): value is PendingNotificationAction['action'] {
  return value === COMPLETE_ACTION_ID || value === SNOOZE_ACTION_ID;
}

/**
 * Native hands back plain dictionaries, and a queue entry can outlive the build
 * that wrote it — an action taken on the old version, drained by the new one.
 * So parse defensively and drop anything unrecognisable rather than trusting it.
 */
export function parsePendingNotificationAction(value: unknown): PendingNotificationAction | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (!isActionId(entry.action)) return null;
  if (typeof entry.taskId !== 'string' || !entry.taskId) return null;
  if (typeof entry.reminderId !== 'string') return null;
  if (typeof entry.at !== 'string' || Number.isNaN(Date.parse(entry.at))) return null;
  const fireAt = typeof entry.fireAt === 'string' && !Number.isNaN(Date.parse(entry.fireAt)) ? entry.fireAt : undefined;
  return {
    action: entry.action,
    taskId: entry.taskId,
    reminderId: entry.reminderId,
    at: entry.at,
    fireAt,
  };
}

/** Snoozes worth keeping: still in the future, and still about a live reminder. */
export function pruneSnoozes(snoozes: SnoozedReminder[], now = new Date()): SnoozedReminder[] {
  const nowMs = now.getTime();
  return snoozes.filter((snooze) => Date.parse(snooze.fireAt) > nowMs);
}

/** Last write wins, so a second snooze on one reminder replaces the first. */
export function withSnooze(snoozes: SnoozedReminder[], snooze: SnoozedReminder): SnoozedReminder[] {
  const others = snoozes.filter((s) => !(s.taskId === snooze.taskId && s.reminderId === snooze.reminderId));
  return [...others, snooze];
}

export function withoutSnoozesFor(snoozes: SnoozedReminder[], taskIds: ReadonlySet<string>): SnoozedReminder[] {
  return snoozes.filter((snooze) => !taskIds.has(snooze.taskId));
}

async function readStoredQueue(): Promise<unknown[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendStoredPendingAction(entry: PendingNotificationAction): Promise<void> {
  const queue = await readStoredQueue();
  await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify([...queue, entry]));
}

/** Reads and clears in one step, so an action cannot be applied twice. */
export async function drainStoredPendingActions(): Promise<PendingNotificationAction[]> {
  const queue = await readStoredQueue();
  if (queue.length > 0) await AsyncStorage.removeItem(PENDING_ACTIONS_KEY);
  return queue.map(parsePendingNotificationAction).filter((entry): entry is PendingNotificationAction => entry !== null);
}

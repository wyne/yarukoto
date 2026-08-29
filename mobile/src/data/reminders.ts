import { Task, TaskReminder } from './types';
import { formatTime24to12, toISODate } from './dateUtils';
import { newReminderId } from './ids';

export const DEFAULT_REMINDER_TIME = '09:00';

export const REMINDER_DAY_PRESETS = [
  { offsetDays: 0, label: 'Due date' },
  { offsetDays: 1, label: '1 day before' },
  { offsetDays: 2, label: '2 days before' },
  { offsetDays: 7, label: '1 week before' },
] as const;

export const REMINDER_TIME_PRESETS = [
  { time: '09:00', label: '9 AM' },
  { time: '10:00', label: '10 AM' },
  { time: '17:00', label: '5 PM' },
] as const;

export interface ReminderPreset {
  offsetDays: number;
  time: string;
  label: string;
}

export function reminderPresets(dueTime?: string): ReminderPreset[] {
  return [
    ...REMINDER_DAY_PRESETS.map((preset) => ({
      offsetDays: preset.offsetDays,
      time: DEFAULT_REMINDER_TIME,
      label: `${preset.label} (${formatTime24to12(DEFAULT_REMINDER_TIME)})`,
    })),
    ...(dueTime ? [{ offsetDays: 0, time: dueTime, label: `Due date (${formatTime24to12(dueTime)})` }] : []),
  ].filter(
    (preset, index, all) =>
      all.findIndex((item) => item.offsetDays === preset.offsetDays && item.time === preset.time) === index
  );
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3650;
}

export function normalizeReminders(value: unknown): TaskReminder[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const reminders: TaskReminder[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Partial<TaskReminder>;
    if (typeof r.id !== 'string' || !validOffset(r.offsetDays) || !validTime(r.time)) continue;
    const normalized = { id: r.id, offsetDays: r.offsetDays, time: r.time };
    const key = reminderKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    reminders.push(normalized);
  }
  return sortReminders(reminders);
}

export function sortReminders(reminders: TaskReminder[]): TaskReminder[] {
  return [...reminders].sort((a, b) => b.offsetDays - a.offsetDays || a.time.localeCompare(b.time));
}

export function reminderKey(reminder: Pick<TaskReminder, 'offsetDays' | 'time'>): string {
  return `${reminder.offsetDays}:${reminder.time}`;
}

export function hasReminder(
  reminders: TaskReminder[] | undefined,
  candidate: Pick<TaskReminder, 'offsetDays' | 'time'>
): boolean {
  const key = reminderKey(candidate);
  return normalizeReminders(reminders).some((r) => reminderKey(r) === key);
}

export function createReminder(offsetDays: number, time = DEFAULT_REMINDER_TIME): TaskReminder {
  return { id: newReminderId(), offsetDays, time };
}

export function reminderOffsetLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'Due date';
  if (offsetDays === 1) return '1 day before';
  if (offsetDays % 7 === 0) {
    const weeks = offsetDays / 7;
    return weeks === 1 ? '1 week before' : `${weeks} weeks before`;
  }
  return `${offsetDays} days before`;
}

export function formatReminder(reminder: Pick<TaskReminder, 'offsetDays' | 'time'>): string {
  return `${reminderOffsetLabel(reminder.offsetDays)} (${formatTime24to12(reminder.time)})`;
}

export function reminderSummary(reminders: TaskReminder[] | undefined): string {
  const normalized = normalizeReminders(reminders);
  if (normalized.length === 0) return 'None';
  if (normalized.length === 1) return formatReminder(normalized[0]);
  return `${normalized.length} reminders`;
}

export function taskPatchForReminders(
  task: Pick<Task, 'dueDate'>,
  reminders: TaskReminder[],
  now = new Date()
): Pick<Task, 'dueDate' | 'reminders'> {
  const normalized = normalizeReminders(reminders);
  return {
    dueDate: task.dueDate ?? (normalized.length > 0 ? toISODate(now) : undefined),
    reminders: normalized.length > 0 ? normalized : undefined,
  };
}

export function normalizeTaskPatch<T extends Partial<Task>>(patch: T): T {
  if (Object.prototype.hasOwnProperty.call(patch, 'dueDate') && patch.dueDate === undefined) {
    return { ...patch, dueTime: undefined, reminders: undefined };
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'reminders')) {
    const reminders = normalizeReminders(patch.reminders);
    return { ...patch, reminders: reminders.length > 0 ? reminders : undefined };
  }
  return patch;
}

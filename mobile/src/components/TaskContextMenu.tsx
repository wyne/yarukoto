import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, priorityColor } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { Priority, Task } from '../data/types';
import { addDays, toISODate } from '../data/dateUtils';
import Popover, { PopoverAnchor } from './Popover';
import { IconCheckBig, IconStack, IconTag, IconTrash } from '../icons/Icons';

interface Props {
  task: Task | null;
  /** The pointer position the menu opened at. */
  at: PopoverAnchor | null;
  onClose: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onPickDate: () => void;
  onMove: () => void;
  onTags: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}

/** Same wording as the due-date sheet, so one date means one thing everywhere. */
const DATES: { label: string; get: (now: Date) => string | undefined }[] = [
  { label: 'Today', get: (now) => toISODate(now) },
  { label: 'Tomorrow', get: (now) => toISODate(addDays(now, 1)) },
  { label: 'Next week', get: (now) => toISODate(addDays(now, 7)) },
  { label: 'No date', get: () => undefined },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Med' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

/**
 * Right-click menu for a task: the edits worth making without opening it.
 *
 * Date and priority lead, as the two fields changed often enough to be worth a
 * single click, and both show what the task currently holds. Anything needing a
 * choice of its own — a specific date, a list, tags — hands off to the sheet
 * that already owns it rather than reimplementing the picker in miniature.
 */
export default function TaskContextMenu({
  task,
  at,
  onClose,
  onPatch,
  onPickDate,
  onMove,
  onTags,
  onToggleComplete,
  onDelete,
}: Props) {
  const accent = useAccent();
  if (!task) return null;

  const now = new Date();
  // Closing on every choice is deliberate: these are one-shot edits, and leaving
  // the menu up over a row that just moved under a sort would be disorienting.
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <Popover visible={!!at} onClose={onClose} anchor={at} align="start" width={292}>
      <Text style={styles.label}>Date</Text>
      <View style={styles.chips}>
        {DATES.map((d) => {
          const value = d.get(now);
          const active = (task.dueDate ?? undefined) === value;
          return (
            <Pressable
              key={d.label}
              onPress={run(() => onPatch({ dueDate: value }))}
              style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.label}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={run(onPickDate)} style={styles.chip}>
          <Text style={styles.chipText}>Pick…</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Priority</Text>
      <View style={styles.chips}>
        {PRIORITIES.map((p) => {
          const active = task.priority === p.value;
          const tint = p.value === 'none' ? colors.ringNone : priorityColor(p.value);
          return (
            <Pressable
              key={p.value}
              onPress={run(() => onPatch({ priority: p.value }))}
              style={[styles.chip, active && { backgroundColor: tint, borderColor: tint }]}
            >
              <View style={[styles.dot, { borderColor: active ? '#fff' : tint }]} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.divider} />

      <Row
        icon={<IconCheckBig size={15} color={colors.textSecondary} />}
        label={task.completed ? 'Mark as not done' : 'Mark as done'}
        onPress={run(onToggleComplete)}
      />
      <Row icon={<IconStack size={16} />} label="Move to…" onPress={run(onMove)} />
      <Row icon={<IconTag size={16} />} label="Tags…" onPress={run(onTags)} />

      <View style={styles.divider} />

      <Row icon={<IconTrash size={16} />} label="Delete" destructive onPress={run(onDelete)} />
    </Popover>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={[styles.rowText, destructive && { color: colors.priorityHigh }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: '#fff',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  rowPressed: {
    backgroundColor: colors.chipBg,
  },
  rowIcon: {
    width: 18,
    alignItems: 'center',
  },
  rowText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
});

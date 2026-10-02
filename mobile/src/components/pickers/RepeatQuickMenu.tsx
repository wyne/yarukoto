import React, { useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import MenuView, { type MenuAction, type NativeActionEvent } from '../NativeMenu';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { formatDueFull, fromISODate, toISODate } from '../../data/dateUtils';
import {
  describeRepeat,
  formatRepeatRule,
  nextOccurrence,
  normalizeRepeat,
  ordinal,
  parseRepeatRule,
  repeatPresets,
  sameRepeat,
  weekOfMonth,
  type RepeatFrequency,
  type RepeatRule,
} from '../../data/recurrence';
import type { TaskRepeat } from '../../data/types';
import { useNativeDateTimePicker } from '../../navigation/DateTimePickerContext';
import Sheet from '../Sheet';

const FREQ_TABS: RepeatFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
const FREQ_LABELS: Record<RepeatFrequency, string> = { daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year' };
/** Monday first, as TickTick lays the week out. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_INTERVAL = 99;
const MAX_COUNT = 999;

type MonthMode = 'day' | 'nth' | 'last';
type EndMode = 'never' | 'until' | 'count';

/** The custom panel's state: the parts of a rule the panel can show. */
interface Draft {
  freq: RepeatFrequency;
  interval: number;
  weekdays: number[];
  monthMode: MonthMode;
  from: TaskRepeat['from'];
  end: EndMode;
  until: string;
  count: number;
}

function draftFrom(repeat: TaskRepeat | null | undefined, dueDate: string): Draft {
  const due = fromISODate(dueDate);
  const rule = repeat ? parseRepeatRule(repeat.rule) : null;
  const monthMode: MonthMode = !rule
    ? 'day'
    : rule.byMonthDay.length === 1 && rule.byMonthDay[0] === -1
      ? 'last'
      : rule.byDay.some((w) => w.nth !== undefined)
        ? 'nth'
        : 'day';
  return {
    freq: rule?.freq ?? 'weekly',
    interval: rule?.interval ?? 1,
    weekdays: rule?.freq === 'weekly' && rule.byDay.length ? rule.byDay.map((w) => w.day) : [due.getDay()],
    monthMode,
    from: repeat?.from ?? 'due',
    end: rule?.count !== undefined ? 'count' : rule?.until ? 'until' : 'never',
    until: rule?.until ?? toISODate(new Date(due.getFullYear(), due.getMonth() + 3, due.getDate())),
    count: rule?.count ?? 10,
  };
}

/**
 * The rule a draft stands for. Completion-based repeats keep only the interval,
 * since "every Monday, counted from when I did it" has no meaning — TickTick's
 * picker drops the weekday choice in that mode too.
 */
function repeatFromDraft(draft: Draft, dueDate: string): TaskRepeat {
  const due = fromISODate(dueDate);
  const rule: RepeatRule = {
    freq: draft.freq,
    interval: draft.interval,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    bySetPos: [],
    skipWeekends: false,
  };
  if (draft.from === 'due') {
    if (draft.freq === 'weekly') {
      rule.byDay = WEEK_ORDER.filter((d) => draft.weekdays.includes(d)).map((day) => ({ day }));
    } else if (draft.freq === 'monthly') {
      if (draft.monthMode === 'last') rule.byMonthDay = [-1];
      else if (draft.monthMode === 'nth') rule.byDay = [{ day: due.getDay(), nth: weekOfMonth(dueDate) }];
      else rule.byMonthDay = [due.getDate()];
    } else if (draft.freq === 'yearly') {
      rule.byMonth = [due.getMonth() + 1];
      rule.byMonthDay = [due.getDate()];
    }
  }
  if (draft.end === 'count') rule.count = draft.count;
  if (draft.end === 'until') rule.until = draft.until;
  return { rule: formatRepeatRule(rule), from: draft.from };
}

function nthLabel(nth: number): string {
  return nth === -1 ? 'last' : ordinal(nth);
}

interface Props {
  dueDate: string;
  repeat?: TaskRepeat | null;
  onChange: (repeat: TaskRepeat | null) => void;
  /** TickTick's "Skip": on to the next date without completing this one. */
  onSkip?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The task detail's Repeat row: TickTick's quick choices in a native menu, and
 * a custom panel for everything else — every N days/weeks/months/years, which
 * weekdays, which day of the month, from the due date or from completion, and
 * when it ends.
 */
export default function RepeatQuickMenu({ dueDate, repeat: rawRepeat, onChange, onSkip, children, style }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const presentDateTimePicker = useNativeDateTimePicker();
  const repeat = normalizeRepeat(rawRepeat);
  const presets = useMemo(() => repeatPresets(dueDate), [dueDate]);
  const isPreset = !!repeat && presets.some((p) => sameRepeat(p.repeat, repeat));
  const canSkip = !!repeat && !!onSkip && nextOccurrence(repeat, dueDate, toISODate(new Date())) !== null;

  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(repeat, dueDate));
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const due = fromISODate(dueDate);
  const draftRepeat = repeatFromDraft(draft, dueDate);

  const openCustom = () => {
    Keyboard.dismiss();
    setDraft(draftFrom(repeat, dueDate));
    setCustomOpen(true);
  };

  const actions: MenuAction[] = [
    {
      title: 'Repeat',
      displayInline: true,
      subactions: [
        { id: 'none', title: 'None', state: repeat ? ('off' as const) : ('on' as const) },
        ...presets.map((preset) => ({
          id: `preset:${preset.key}`,
          title: preset.label,
          state: sameRepeat(preset.repeat, repeat) ? ('on' as const) : ('off' as const),
        })),
        ...(repeat && !isPreset ? [{ id: 'current', title: describeRepeat(repeat, dueDate), state: 'on' as const }] : []),
      ],
    },
    { id: 'custom', title: 'Custom...', image: 'slider.horizontal.3' as const },
    ...(canSkip ? [{ id: 'skip', title: 'Skip this occurrence', image: 'forward.end' as const }] : []),
  ];

  const handleAction = ({ nativeEvent }: NativeActionEvent) => {
    const id = nativeEvent.event;
    if (id === 'custom' || id === 'current') {
      openCustom();
      return;
    }
    if (id === 'none') {
      onChange(null);
      return;
    }
    if (id === 'skip') {
      onSkip?.();
      return;
    }
    const preset = presets.find((p) => `preset:${p.key}` === id);
    if (preset) onChange(preset.repeat);
  };

  const pickUntil = () => {
    presentDateTimePicker({
      mode: 'date',
      date: draft.until,
      onChange: (date) => {
        if (date) update({ until: date < dueDate ? dueDate : date });
      },
    });
  };

  const trigger =
    Platform.OS === 'web' ? (
      <Pressable accessibilityRole="button" accessibilityLabel="Repeat" style={style} onPress={openCustom}>
        {children}
      </Pressable>
    ) : (
      <MenuView title="Repeat" actions={actions} onPressAction={handleAction} style={style}>
        {children}
      </MenuView>
    );

  const tab = <T extends string>(value: T, current: T, label: string, onPress: (value: T) => void) => {
    const active = value === current;
    return (
      <Pressable
        key={value}
        style={[styles.tab, active && { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => onPress(value)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <Text style={[styles.tabText, { color: active ? colors.textPrimary : colors.textSecondary }]}>{label}</Text>
      </Pressable>
    );
  };

  const stepper = (value: number, max: number, onValue: (n: number) => void, label: string) => (
    <View style={styles.stepper}>
      <Pressable
        style={styles.stepButton}
        onPress={() => onValue(Math.max(1, value - 1))}
        disabled={value <= 1}
        accessibilityRole="button"
        accessibilityLabel={`Fewer ${label}`}
      >
        <Text style={[styles.stepText, { color: value <= 1 ? colors.textTertiary : accent }]}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        style={styles.stepButton}
        onPress={() => onValue(Math.min(max, value + 1))}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel={`More ${label}`}
      >
        <Text style={[styles.stepText, { color: value >= max ? colors.textTertiary : accent }]}>+</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <View style={[style, styles.triggerFrame]}>{trigger}</View>
      {/*
        A dialog on the desktop rather than a popover by the row: the panel is
        taller than the space below a row near the bottom of the window, and a
        popover is placed, not scrolled. The dialog scrolls itself.
      */}
      <Sheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Repeat"
        dialogWidth={380}
        stackBehavior="push"
        onCancel={() => setCustomOpen(false)}
        onConfirm={() => {
          onChange(draftRepeat);
          setCustomOpen(false);
        }}
        confirmLabel="Done"
      >
        <View style={styles.body}>
          {/* The web has no native menu, so the quick choices live here too. */}
          {Platform.OS === 'web' && (
            <View style={styles.presets}>
              {presets.map((preset) => {
                const on = sameRepeat(preset.repeat, repeat);
                return (
                  <Pressable
                    key={preset.key}
                    style={[styles.preset, on && { borderColor: accent }]}
                    onPress={() => {
                      onChange(preset.repeat);
                      setCustomOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.presetText, on && { color: accent }]}>{preset.label}</Text>
                  </Pressable>
                );
              })}
              {repeat && (
                <Pressable
                  style={styles.preset}
                  onPress={() => {
                    onChange(null);
                    setCustomOpen(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.presetText}>Don't repeat</Text>
                </Pressable>
              )}
              {canSkip && (
                <Pressable
                  style={styles.preset}
                  onPress={() => {
                    onSkip?.();
                    setCustomOpen(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.presetText}>Skip this occurrence</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text style={[styles.summary, { color: accent }]}>{describeRepeat(draftRepeat, dueDate)}</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Every</Text>
            {stepper(draft.interval, MAX_INTERVAL, (interval) => update({ interval }), FREQ_LABELS[draft.freq].toLowerCase() + 's')}
          </View>
          <View style={styles.tabs}>
            {FREQ_TABS.map((freq) =>
              tab(freq, draft.freq, draft.interval === 1 ? FREQ_LABELS[freq] : `${FREQ_LABELS[freq]}s`, (value) => update({ freq: value }))
            )}
          </View>

          {draft.from === 'due' && draft.freq === 'weekly' && (
            <View style={styles.weekdays}>
              {WEEK_ORDER.map((day) => {
                const on = draft.weekdays.includes(day);
                return (
                  <Pressable
                    key={day}
                    style={[styles.weekday, on && { backgroundColor: accent, borderColor: accent }]}
                    onPress={() => {
                      const next = on ? draft.weekdays.filter((d) => d !== day) : [...draft.weekdays, day];
                      // An empty week means nothing; keep the last one on.
                      if (next.length) update({ weekdays: next });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={WEEKDAY_NAMES[day]}
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.weekdayText, { color: on ? '#fff' : colors.textSecondary }]}>{WEEKDAY_INITIALS[day]}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {draft.from === 'due' && draft.freq === 'monthly' && (
            <View style={styles.tabs}>
              {tab('day', draft.monthMode, `Day ${due.getDate()}`, (value: MonthMode) => update({ monthMode: value }))}
              {tab('nth', draft.monthMode, `${nthLabel(weekOfMonth(dueDate))} ${WEEKDAY_NAMES[due.getDay()].slice(0, 3)}`, (value: MonthMode) =>
                update({ monthMode: value })
              )}
              {tab('last', draft.monthMode, 'Last day', (value: MonthMode) => update({ monthMode: value }))}
            </View>
          )}

          <Text style={styles.sectionLabel}>Repeat from</Text>
          <View style={styles.tabs}>
            {tab('due', draft.from, 'Due date', (value: TaskRepeat['from']) => update({ from: value }))}
            {tab('completion', draft.from, 'Completion', (value: TaskRepeat['from']) => update({ from: value }))}
          </View>

          <Text style={styles.sectionLabel}>Ends</Text>
          <View style={styles.tabs}>
            {tab('never', draft.end, 'Never', (value: EndMode) => update({ end: value }))}
            {tab('until', draft.end, 'On date', (value: EndMode) => update({ end: value }))}
            {tab('count', draft.end, 'After', (value: EndMode) => update({ end: value }))}
          </View>
          {draft.end === 'until' && (
            <Pressable style={styles.valueButton} onPress={pickUntil} accessibilityRole="button" accessibilityLabel="End date">
              <Text style={[styles.valueButtonText, { color: accent }]}>{formatDueFull(draft.until)}</Text>
            </Pressable>
          )}
          {draft.end === 'count' && (
            <View style={styles.row}>
              {stepper(draft.count, MAX_COUNT, (count) => update({ count }), 'times')}
              <Text style={styles.label}>{draft.count === 1 ? 'time' : 'times'}</Text>
            </View>
          )}
        </View>
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  triggerFrame: {
    flexDirection: 'row',
  },
  body: {
    gap: 12,
    paddingTop: 4,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  preset: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
  },
  presetText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: c.textPrimary,
  },
  summary: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.textPrimary,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: c.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 2,
    padding: 2,
    borderRadius: 9,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.divider,
  },
  tab: {
    minWidth: 64,
    minHeight: 30,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    backgroundColor: c.surfaceMuted,
  },
  stepButton: {
    width: 36,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 18,
  },
  stepValue: {
    minWidth: 32,
    textAlign: 'center',
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.textPrimary,
  },
  weekdays: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  weekday: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
  },
  valueButton: {
    alignSelf: 'center',
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: c.surfaceMuted,
  },
  valueButtonText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
  },
}));


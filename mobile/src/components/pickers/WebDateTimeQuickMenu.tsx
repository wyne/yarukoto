import React, { useRef, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Popover, { type PopoverAnchor } from '../Popover';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors, useScheme } from '../../theme/ThemeContext';
import { formatTime24to12 } from '../../data/dateUtils';
import { IconCheckBig, IconChevronLeft } from '../../icons/Icons';
import { QUICK_DATES, QUICK_TIMES } from './dateTimeQuickOptions';

type PickerMode = 'date' | 'time';

interface Props {
  mode: PickerMode;
  date?: string;
  time?: string;
  showTimeShortcut?: boolean;
  accessibilityLabel?: string;
  onChange: (date: string | undefined, time: string | undefined) => void;
  onDone?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  clearLabel?: string;
}

export default function WebDateTimeQuickMenu({
  mode,
  date,
  time,
  showTimeShortcut = false,
  accessibilityLabel,
  onChange,
  onDone,
  children,
  style,
  clearLabel = 'Clear',
}: Props) {
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const scheme = useScheme();
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState<PickerMode | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const now = new Date();
  const quickDates = QUICK_DATES.map((item) => ({ ...item, value: item.get(now) }));

  const close = () => {
    setOpen(false);
    setCustomMode(null);
  };
  const finish = () => {
    close();
    onDone?.();
  };
  const show = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setCustomMode(null);
      setOpen(true);
    });
  };
  const showCustom = (nextMode: PickerMode) => {
    setDraftValue(nextMode === 'date' ? (date ?? '') : (time ?? ''));
    setCustomMode(nextMode);
  };
  const chooseDate = (next: string | undefined) => {
    onChange(next, next ? time : undefined);
    finish();
  };
  const chooseTime = (next: string | undefined) => {
    onChange(date, next);
    finish();
  };
  const applyCustom = () => {
    if (!draftValue || !customMode) return;
    if (customMode === 'date') chooseDate(draftValue);
    else chooseTime(draftValue);
  };

  const nativeInput = customMode
    ? React.createElement('input', {
        autoFocus: true,
        type: customMode,
        value: draftValue,
        step: customMode === 'time' ? 60 : undefined,
        'aria-label': customMode === 'date' ? 'Due date' : 'Due time',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDraftValue(event.currentTarget.value),
        onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') applyCustom();
        },
        style: {
          width: '100%',
          height: 42,
          boxSizing: 'border-box',
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: '0 11px',
          background: colors.surface,
          color: colors.textPrimary,
          fontFamily: fonts.sansRegular,
          fontSize: 16,
          colorScheme: scheme,
        },
      })
    : null;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        style={style}
      >
        {children}
      </Pressable>
      <Popover visible={open} onClose={close} anchor={anchor} width={280}>
        {customMode ? (
          <View style={styles.customPanel}>
            <View style={styles.customHeader}>
              <Pressable style={styles.backRow} onPress={() => setCustomMode(null)}>
                <IconChevronLeft size={13} color={colors.textTertiary} />
                <Text style={styles.panelTitle}>{customMode === 'date' ? 'Pick date' : 'Pick time'}</Text>
              </Pressable>
              <Pressable disabled={!draftValue} style={styles.doneButton} onPress={applyCustom}>
                <Text style={[styles.doneText, { color: draftValue ? accent : colors.textFaint }]}>Done</Text>
              </Pressable>
            </View>
            {nativeInput}
          </View>
        ) : (
          <View style={styles.options}>
            {mode === 'date' &&
              quickDates.map((item) => (
                <MenuRow
                  key={item.id}
                  label={item.label}
                  selected={date === item.value}
                  accent={accent}
                  onPress={() => chooseDate(item.value)}
                />
              ))}
            {mode === 'time' &&
              QUICK_TIMES.map((item) => (
                <MenuRow
                  key={item.id}
                  label={item.label}
                  selected={time === item.id}
                  accent={accent}
                  onPress={() => chooseTime(item.id)}
                />
              ))}
            {mode === 'date' && showTimeShortcut && date && (
              <MenuRow
                label={time ? `Time: ${formatTime24to12(time)}` : 'Time'}
                onPress={() => showCustom('time')}
              />
            )}
            <View style={styles.divider} />
            <MenuRow
              label={mode === 'date' ? 'Pick date' : 'Pick time'}
              onPress={() => showCustom(mode)}
            />
            <MenuRow
              label={clearLabel}
              selected={mode === 'date' ? !date : !time}
              accent={accent}
              destructive={mode === 'date' ? !!(date || time) : !!time}
              onPress={() => (mode === 'date' ? chooseDate(undefined) : chooseTime(undefined))}
            />
          </View>
        )}
      </Popover>
    </>
  );
}

function MenuRow({
  label,
  selected = false,
  accent,
  destructive = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  accent?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable style={styles.optionRow} onPress={onPress} accessibilityRole="menuitem">
      <Text style={[styles.optionLabel, destructive && styles.destructive]}>{label}</Text>
      {selected && <IconCheckBig size={14} color={accent ?? colors.textSecondary} strokeWidth={2.3} />}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  options: {
    marginHorizontal: -6,
    marginTop: -6,
  },
  optionRow: {
    minHeight: 38,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 7,
  },
  optionLabel: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
  },
  destructive: {
    color: c.priorityHigh,
  },
  divider: {
    height: 1,
    marginVertical: 4,
    backgroundColor: c.divider,
  },
  customPanel: {
    paddingBottom: 8,
  },
  customHeader: {
    minHeight: 30,
    marginTop: -6,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  panelTitle: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  doneButton: {
    minHeight: 30,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
}));

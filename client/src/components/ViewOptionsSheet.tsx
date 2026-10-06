import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Pressable from './HoverPressable';
import { makeStyles } from '../theme/styles';
import { useHoverBg } from '../theme/hover';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import Sheet, { useDesktopPresentation } from './Sheet';
import Popover, { PopoverAnchor } from './Popover';
import { DESKTOP_UI } from '../data/platform';
import {
  GROUP_BY_OPTIONS,
  GroupBy,
  SORT_BY_OPTIONS,
  SortBy,
  ViewOptions,
  hasArrangement,
  sortLabel,
} from '../data/viewOptions';

interface Props {
  visible: boolean;
  onClose: () => void;
  value: ViewOptions;
  onChange: (next: ViewOptions) => void;
  /** Drops the current sort's hand-made arrangement, keeping the sort itself. */
  onRestore: () => void;
  /** Where the header button sits, so the desktop popover can tether to it. */
  anchor?: PopoverAnchor | null;
}

export default function ViewOptionsSheet({ visible, onClose, value, onChange, onRestore, anchor }: Props) {
  const hoverBg = useHoverBg();
  const styles = useStyles();
  const accent = useAccent();
  const desktop = useDesktopPresentation();
  const [draft, setDraft] = useState(value);
  const wasVisible = useRef(false);
  const pendingApply = useRef<ViewOptions | null>(null);

  // Native uses an explicit Done action, so choices stay local to the sheet
  // until then. Web has no Done button and continues to update immediately.
  useEffect(() => {
    if (visible && !wasVisible.current) setDraft(value);
    wasVisible.current = visible;
  }, [value, visible]);

  const displayedValue = DESKTOP_UI ? value : draft;
  const updateValue = (next: ViewOptions) => {
    if (DESKTOP_UI) onChange(next);
    else setDraft(next);
  };
  const restoreOrder = () => {
    if (DESKTOP_UI) {
      onRestore();
      return;
    }
    const { [displayedValue.sortBy]: _removed, ...arrangements } = displayedValue.arrangements;
    setDraft({ ...displayedValue, arrangements });
  };

  const renderRow = <T extends string>(
    label: string,
    options: { value: T; label: string }[],
    selected: T,
    onSelect: (v: T) => void
  ) => (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={hoverBg([styles.chip, active && { backgroundColor: accent, borderColor: accent }], active)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const body = (
    <>
      {renderRow<GroupBy>('Group by', GROUP_BY_OPTIONS, displayedValue.groupBy, (groupBy) =>
        updateValue({ ...displayedValue, groupBy })
      )}
      {renderRow<SortBy>('Sort by', SORT_BY_OPTIONS, displayedValue.sortBy, (sortBy) =>
        updateValue({ ...displayedValue, sortBy })
      )}
      {/* Switching sorts just stops matching this sort's arrangement, leaving it
          intact for later. This is the way back for someone who wants to drop the
          arrangement and keep the sort they already have. */}
      {hasArrangement(displayedValue.arrangements, displayedValue.sortBy) && (
        <Pressable style={hoverBg(styles.restore)} onPress={restoreOrder}>
          <Text style={styles.restoreText}>
            Order customised — restore {sortLabel(displayedValue.sortBy)} sort
          </Text>
        </Pressable>
      )}
    </>
  );

  // A sheet travels the whole height of the window to answer a question asked in
  // the top corner. With a pointer that reads as a detour, so a roomy web window
  // gets a panel tethered to the button instead — and clicking away is the only
  // exit it needs, which retires the Done button with it. A narrow browser keeps
  // the sheet, which is the better shape on a phone. Drawn here rather than by
  // Sheet's own popover because it has no title row to spend room on.
  if (desktop) {
    return (
      <Popover visible={visible} onClose={onClose} anchor={anchor ?? null}>
        {body}
      </Popover>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={
        DESKTOP_UI
          ? undefined
          : () => {
              const next = pendingApply.current;
              pendingApply.current = null;
              if (next) onChange(next);
            }
      }
      title="View options"
    >
      {body}
      <Pressable
        style={styles.doneBtn}
        onPress={() => {
          if (!DESKTOP_UI) pendingApply.current = draft;
          onClose();
        }}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
    minHeight: 34,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: c.textPrimary,
  },
  chipTextActive: {
    // Stays white: this chip is filled with the accent, which keeps its colour
    // in both schemes. `inverseText` would go dark on it.
    color: '#fff',
  },
  restore: {
    marginTop: -8,
    marginBottom: 18,
  },
  restoreText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: c.textTertiary,
  },
  doneBtn: {
    marginTop: 2,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: c.inverseSurface,
  },
  doneBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.inverseText,
  },
}));

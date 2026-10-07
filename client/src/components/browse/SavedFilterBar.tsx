import React, { useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import Pressable from '../HoverPressable';
import { makeStyles } from '../../theme/styles';
import { useHoverBg } from '../../theme/hover';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { TaskCriteria, isEmptyCriteria, sameCriteria } from '../../data/taskFilter';
import SavedFilterSheet, { SavedFilterTarget } from './SavedFilterSheet';

interface Props {
  criteria: TaskCriteria;
  onChange: (next: TaskCriteria) => void;
}

/**
 * Saved filters, as a row of chips above the filters they stand for.
 *
 * A tap asks that question again. Tapping the one already asked opens it for
 * editing — the chip is plainly selected, so a second tap is the one gesture
 * with nothing better to mean, and unlike a long press it works with a pointer.
 * "Save" appears once the chips below ask something no saved filter already
 * does.
 *
 * Renders nothing when the connected server cannot keep saved filters, since a
 * filter saved there would not survive the next hydrate.
 */
export default function SavedFilterBar({ criteria, onChange }: Props) {
  const hoverBg = useHoverBg();
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const { state, supportsFeature } = useTasks();
  const [target, setTarget] = useState<SavedFilterTarget | null>(null);

  const filters = useMemo(
    () => state.savedFilters.filter((f) => !f.deletedAt).sort((a, b) => a.order - b.order),
    [state.savedFilters]
  );
  const current = filters.find((f) => sameCriteria(f.criteria, criteria));
  const canSave = !current && !isEmptyCriteria(criteria);

  if (!supportsFeature('savedFilters')) return null;
  if (filters.length === 0 && !canSave) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bar}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {filters.map((filter) => {
          const active = filter === current;
          return (
            <Pressable
              key={filter.id}
              style={hoverBg([styles.chip, active && { backgroundColor: accent, borderColor: accent }], active)}
              onPress={() =>
                active ? setTarget({ kind: 'edit', filter, current: criteria }) : onChange(filter.criteria)
              }
              onLongPress={() => setTarget({ kind: 'edit', filter, current: criteria })}
              accessibilityLabel={active ? `Edit saved filter ${filter.name}` : `Apply saved filter ${filter.name}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{filter.name}</Text>
            </Pressable>
          );
        })}
        {canSave && (
          <Pressable
            style={hoverBg([styles.chip, styles.save])}
            onPress={() => setTarget({ kind: 'new', criteria })}
            accessibilityLabel="Save these filters"
          >
            <Text style={[styles.chipText, { color: colors.textTertiary }]}>+ Save</Text>
          </Pressable>
        )}
      </ScrollView>

      <SavedFilterSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}

const useStyles = makeStyles((c) => ({
  // See FilterBar: a horizontal ScrollView grows (and on web shrinks) with its column otherwise.
  bar: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 7,
    minHeight: 32,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: c.textPrimary,
  },
  chipTextActive: {
    color: '#fff',
  },
  save: {
    borderStyle: 'dashed',
  },
}));

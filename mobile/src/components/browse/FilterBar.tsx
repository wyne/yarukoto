import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { makeStyles } from '../../theme/styles';
import { useHoverBg } from '../../theme/hover';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { getListById } from '../../data/selectors';
import {
  EMPTY_CRITERIA,
  INBOX_LIST_ID,
  TaskCriteria,
  isEmptyCriteria,
} from '../../data/taskFilter';
import type { PopoverAnchor } from '../Popover';
import { SortBy, sortLabel } from '../../data/viewOptions';
import FilterSheet, { FilterKind } from './FilterSheet';
import { dueLabel, statusLabel } from './filterOptions';

interface Props {
  criteria: TaskCriteria;
  onChange: (next: TaskCriteria) => void;
  sortBy?: SortBy;
  onSortChange?: (sortBy: SortBy) => void;
  /**
   * Offer the status filter. Off for a surface where only active tasks are a
   * sensible answer, which leaves `criteria.status` at whatever it was given.
   */
  showStatus?: boolean;
}

/**
 * The filters, plus an optional sort control, as chips that say what they are
 * currently set to.
 *
 * A chip reads as its own answer rather than its name — "Overdue", "2 lists" —
 * so the row states the whole question at a glance and there is nothing to open
 * to find out what is being applied. Only a chip that narrows something is
 * filled; the rest name the dimension and stay quiet.
 */
export default function FilterBar({ criteria, onChange, sortBy, onSortChange, showStatus = true }: Props) {
  const hoverBg = useHoverBg();
  const colors = useColors();
  const styles = useStyles();
  const accent = useAccent();
  const { state } = useTasks();
  const [open, setOpen] = useState<FilterKind | null>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const chips = useRef<Partial<Record<FilterKind, View | null>>>({});

  /**
   * Measured on press rather than on layout: the row scrolls sideways, so a rect
   * taken at layout would tether the popover to where the chip used to be.
   */
  const press = (kind: FilterKind) => {
    const node = chips.current[kind];
    if (!node) {
      setAnchor(null);
      setOpen(kind);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(kind);
    });
  };

  /**
   * Counted against what still exists.
   *
   * `filterTasks` already ignores an id whose list has been deleted, so the chip
   * has to as well — otherwise it goes on claiming a filter that stopped
   * applying, and the one place you would look to explain a result set is the
   * one place lying about it.
   */
  const liveListIds = criteria.listIds.filter(
    (id) => id === INBOX_LIST_ID || !!getListById(state.lists, id)
  );
  const liveFolderIds = criteria.folderIds.filter((id) =>
    state.folders.some((f) => f.id === id && !f.deletedAt)
  );
  const listCount = liveListIds.length + liveFolderIds.length;

  const listsLabel = () => {
    if (listCount === 0) return 'Lists';
    if (listCount > 1) return `${listCount} lists`;
    const [id] = liveListIds;
    if (id === INBOX_LIST_ID) return 'Inbox';
    if (id) return getListById(state.lists, id)?.name ?? 'Lists';
    return state.folders.find((f) => f.id === liveFolderIds[0])?.name ?? 'Lists';
  };

  const tagsLabel = () => {
    if (criteria.tags.length === 0) return 'Tags';
    if (criteria.tags.length > 1) return `${criteria.tags.length} tags`;
    return `#${criteria.tags[0]}`;
  };

  const chip = (kind: FilterKind, label: string, active: boolean) => (
    <View ref={(node) => { chips.current[kind] = node; }} collapsable={false}>
      <Pressable
        style={hoverBg(
          [styles.chip, active && { backgroundColor: accent, borderColor: accent }],
          active
        )}
        onPress={() => press(kind)}
        accessibilityLabel={`Filter by ${kind}`}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bar}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {chip('lists', listsLabel(), listCount > 0)}
        {chip('tags', tagsLabel(), criteria.tags.length > 0)}
        {chip('due', criteria.due === 'any' ? 'Due' : dueLabel(criteria.due), criteria.due !== 'any')}
        {showStatus &&
          chip(
            'status',
            criteria.status === EMPTY_CRITERIA.status ? 'Status' : statusLabel(criteria.status),
            criteria.status !== EMPTY_CRITERIA.status
          )}
        {sortBy !== undefined &&
          onSortChange &&
          chip('sort', sortBy === 'manual' ? 'Sort by' : `Sort: ${sortLabel(sortBy)}`, sortBy !== 'manual')}
        {/* Only worth offering once there is something to undo, and it takes the
            query with it — the field is part of the question being cleared. */}
        {!isEmptyCriteria(criteria) && (
          <Pressable
            style={hoverBg([styles.chip, styles.clear])}
            onPress={() => onChange(EMPTY_CRITERIA)}
            accessibilityLabel="Clear filters"
          >
            <Text style={[styles.chipText, { color: colors.textTertiary }]}>Clear</Text>
          </Pressable>
        )}
      </ScrollView>

      <FilterSheet
        kind={open}
        anchor={anchor}
        criteria={criteria}
        onChange={onChange}
        sortBy={sortBy}
        onSortChange={onSortChange}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

const useStyles = makeStyles((c) => ({
  /**
   * A row of chips is as tall as a chip. React Native gives every ScrollView
   * `flexGrow: 1`, so in a column with room to spare this one takes all of it and
   * pushes whatever follows to the bottom of the screen.
   */
  bar: {
    flexGrow: 0,
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
    borderRadius: 8,
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
  clear: {
    borderStyle: 'dashed',
  },
}));

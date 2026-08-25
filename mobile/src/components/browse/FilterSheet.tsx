import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { makeStyles } from '../../theme/styles';
import { useHoverBg } from '../../theme/hover';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { navGroups, tagCounts } from '../../data/selectors';
import { INBOX_LIST_ID, TaskCriteria } from '../../data/taskFilter';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import { IconCheckBig } from '../../icons/Icons';
import { DUE_OPTIONS, STATUS_OPTIONS } from './filterOptions';

/** Which chip was pressed, and so which set of choices the sheet is showing. */
export type FilterKind = 'lists' | 'tags' | 'due' | 'status';

const TITLES: Record<FilterKind, string> = {
  lists: 'Lists',
  tags: 'Tags',
  due: 'Due',
  status: 'Status',
};

interface Props {
  kind: FilterKind | null;
  anchor: PopoverAnchor | null;
  criteria: TaskCriteria;
  onChange: (next: TaskCriteria) => void;
  onClose: () => void;
}

/** Adds or removes one value, which is all any of the multi-choice rows do. */
function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/**
 * The choices behind one filter chip.
 *
 * Lists and tags stay open as you pick, because picking two is the ordinary
 * case and a sheet that shut on the first would make the second a second trip.
 * Due and status close on choice — there is only ever one answer to those.
 */
export default function FilterSheet({ kind, anchor, criteria, onChange, onClose }: Props) {
  const styles = useStyles();
  const { state } = useTasks();

  return (
    // `visible={false}` rather than rendering nothing, so the sheet animates out
    // instead of vanishing. Same idiom as ListOptionsSheet.
    <BottomSheet
      visible={kind !== null}
      onClose={onClose}
      title={kind ? TITLES[kind] : ''}
      anchor={anchor}
    >
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {kind === 'lists' && (
          <ListChoices criteria={criteria} onChange={onChange} lists={state.lists} folders={state.folders} />
        )}
        {kind === 'tags' && <TagChoices criteria={criteria} onChange={onChange} />}
        {kind === 'due' &&
          DUE_OPTIONS.map((opt) => (
            <Choice
              key={opt.value}
              label={opt.label}
              selected={criteria.due === opt.value}
              onPress={() => {
                onChange({ ...criteria, due: opt.value });
                onClose();
              }}
            />
          ))}
        {kind === 'status' &&
          STATUS_OPTIONS.map((opt) => (
            <Choice
              key={opt.value}
              label={opt.label}
              selected={criteria.status === opt.value}
              onPress={() => {
                onChange({ ...criteria, status: opt.value });
                onClose();
              }}
            />
          ))}
      </ScrollView>
    </BottomSheet>
  );
}

function ListChoices({
  criteria,
  onChange,
  lists,
  folders,
}: {
  criteria: TaskCriteria;
  onChange: (next: TaskCriteria) => void;
  lists: ReturnType<typeof useTasks>['state']['lists'];
  folders: ReturnType<typeof useTasks>['state']['folders'];
}) {
  const groups = navGroups(lists, folders);
  return (
    <>
      <Choice
        label="Inbox"
        selected={criteria.listIds.includes(INBOX_LIST_ID)}
        onPress={() => onChange({ ...criteria, listIds: toggle(criteria.listIds, INBOX_LIST_ID) })}
      />
      {groups.map((group) => (
        <View key={group.folder?.id ?? 'root'}>
          {/* A folder is a choice in its own right — picking one means every
              list inside it, including any added later. */}
          {group.folder && (
            <Choice
              label={group.folder.name}
              folder
              selected={criteria.folderIds.includes(group.folder.id)}
              onPress={() =>
                onChange({ ...criteria, folderIds: toggle(criteria.folderIds, group.folder!.id) })
              }
            />
          )}
          {group.lists.map((list) => (
            <Choice
              key={list.id}
              label={list.name}
              color={list.color}
              indent={!!group.folder}
              selected={criteria.listIds.includes(list.id)}
              onPress={() => onChange({ ...criteria, listIds: toggle(criteria.listIds, list.id) })}
            />
          ))}
        </View>
      ))}
    </>
  );
}

function TagChoices({
  criteria,
  onChange,
}: {
  criteria: TaskCriteria;
  onChange: (next: TaskCriteria) => void;
}) {
  const styles = useStyles();
  const { state } = useTasks();
  const tags = tagCounts(state.tasks);
  if (tags.length === 0) return <Text style={styles.empty}>No tags yet.</Text>;
  return (
    <>
      {tags.map(({ tag, count }) => (
        <Choice
          key={tag}
          label={`#${tag}`}
          count={count}
          selected={criteria.tags.includes(tag)}
          onPress={() => onChange({ ...criteria, tags: toggle(criteria.tags, tag) })}
        />
      ))}
    </>
  );
}

function Choice({
  label,
  color,
  count,
  folder,
  indent,
  selected,
  onPress,
}: {
  label: string;
  color?: string;
  count?: number;
  folder?: boolean;
  indent?: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const hoverBg = useHoverBg();
  const styles = useStyles();
  const accent = useAccent();
  return (
    <Pressable style={hoverBg([styles.row, indent && styles.rowIndent])} onPress={onPress}>
      {color !== undefined && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.label, folder && styles.labelFolder, selected && { color: accent }]}>
        {label}
      </Text>
      {count !== undefined && <Text style={styles.count}>{count}</Text>}
      {/* A tick rather than a filled row: several of these can be on at once,
          and a run of filled rows stops reading as a list of choices. */}
      <View style={[styles.check, selected && { backgroundColor: accent, borderColor: accent }]}>
        {selected && <IconCheckBig size={12} />}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  /** Bounded so a long list of lists doesn't grow the sheet past the screen. */
  scroll: {
    maxHeight: 420,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  rowIndent: {
    paddingLeft: 18,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: c.textPrimary,
  },
  labelFolder: {
    fontFamily: fonts.sansSemiBold,
  },
  count: {
    fontFamily: fonts.monoRegular,
    fontSize: 12.5,
    color: c.textTertiary,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.ringNone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
    paddingVertical: 16,
    textAlign: 'center',
  },
}));

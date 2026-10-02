import React, { forwardRef, memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { type FlatList, type ListRenderItemInfo, Pressable, type RefreshControlProps, type StyleProp, Text, View, type ViewStyle, type ViewToken } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { LinearTransition } from 'react-native-reanimated';
import ReorderableList, {
  type ReorderableListReorderEvent,
  useIsActive,
  useReorderableDrag,
} from 'react-native-reorderable-list';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { FINE_POINTER } from '../data/platform';
import { Task } from '../data/types';
import { TaskGroup } from '../data/viewOptions';
import SectionHeader from './SectionHeader';
import { IconGrip } from '../icons/Icons';

/**
 * The task list as one virtualized, reorderable list.
 *
 * The list it replaces built every task up front: one draggable column per
 * group inside a plain scroll view. Anything that rebuilt it — opening a long
 * list, or regrouping, which gives every group a new key — paid for every task
 * at once, around 85 components apiece. Here group headers and rows are items
 * of a single FlatList, so only what is near the screen exists, and a regroup
 * re-keys a screenful of rows rather than all of them.
 *
 * Rows only move within their own group. The library does not know about
 * groups, so a drop that lands outside the group it started in is ignored and
 * the row returns to where it was.
 */

export interface RowRenderInfo {
  /** The group the row is drawn under; null for a completed row. */
  groupKey: string | null;
  /** Starts dragging this row. Undefined for rows that cannot be reordered. */
  drag?: () => void;
}

type Item =
  | { kind: 'header'; key: string; group: TaskGroup; collapsed: boolean; first: boolean }
  | { kind: 'completedHeader'; key: string; count: number; collapsed: boolean; first: boolean }
  | { kind: 'empty'; key: string }
  | {
      kind: 'task';
      key: string;
      task: Task;
      next: Task | undefined;
      /** Null for completed rows, which are never reordered. */
      groupKey: string | null;
      first: boolean;
      last: boolean;
    };

interface Props {
  groups: TaskGroup[];
  /** False shows the single group's rows with no header above them. */
  grouped: boolean;
  completed: Task[];
  isGroupCollapsed: (key: string) => boolean;
  toggleGroup: (key: string) => void;
  completedCollapsed: boolean;
  toggleCompleted: () => void;
  emptyText: string;
  dragEnabled: boolean;
  /** Animate rows into place as the list changes. Off for a change of view. */
  animateLayout: boolean;
  renderRow: (task: Task, info: RowRenderInfo) => React.ReactNode;
  renderDivider: (task: Task, next: Task, completed: boolean) => React.ReactNode;
  onReorder: (
    groupKey: string,
    nextIds: string[],
    moved: { id: string; prevId: string | null; nextId: string | null }
  ) => void;
  /** How many rows a drag of this one carries, for the badge on the lifted row. */
  dragCount?: (id: string) => number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  onScrollBeginDrag?: () => void;
  /**
   * The keyboard's cursor. Scrolled into sight when it moves onto a row that
   * isn't, and left alone when it is — a click never scrolls.
   */
  revealTaskId?: string | null;
}

const LAYOUT = LinearTransition.duration(180);
const VIEWABILITY = { itemVisiblePercentThreshold: 100 };

export type VirtualTaskListRef = FlatList<Item>;

const VirtualTaskList = forwardRef<FlatList<Item>, Props>(function VirtualTaskList(
  {
    groups,
    grouped,
    completed,
    isGroupCollapsed,
    toggleGroup,
    completedCollapsed,
    toggleCompleted,
    emptyText,
    dragEnabled,
    animateLayout,
    renderRow,
    renderDivider,
    onReorder,
    dragCount,
    contentContainerStyle,
    refreshControl,
    onScrollBeginDrag,
    revealTaskId,
  },
  ref
) {
  const active = groups.reduce((n, g) => n + g.tasks.length, 0);

  // The list's own pan otherwise activates after 10pt of movement in any
  // direction, which takes the touch from a row's swipe (15pt) and the
  // drawer's swipe. With a touch it now gives up at 5pt, before its own 10pt
  // activation can fire, and otherwise activates only once held — after
  // TaskRow's 350 ms long press has lifted the row. The Mac's grip starts a
  // drag on press, so there it keeps activating at once.
  const panGesture = useMemo(
    () =>
      FINE_POINTER
        ? Gesture.Pan()
        : Gesture.Pan().activateAfterLongPress(400).failOffsetX([-5, 5]).failOffsetY([-5, 5]),
    []
  );

  const items = useMemo(() => {
    const out: Item[] = [];
    if (active === 0) out.push({ kind: 'empty', key: 'empty' });
    else {
      groups.forEach((group, gi) => {
        const collapsed = grouped && isGroupCollapsed(group.key);
        if (grouped) out.push({ kind: 'header', key: `h:${group.key}`, group, collapsed, first: gi === 0 });
        if (collapsed) return;
        group.tasks.forEach((task, i) =>
          out.push({
            kind: 'task',
            // A task can sit in more than one group — two tags — so the group is
            // part of its key.
            key: `${group.key}\u0000${task.id}`,
            task,
            next: group.tasks[i + 1],
            groupKey: group.key,
            first: i === 0 && (grouped || gi === 0),
            last: i === group.tasks.length - 1,
          })
        );
      });
    }
    if (completed.length > 0) {
      out.push({
        kind: 'completedHeader',
        key: 'h:completed',
        count: completed.length,
        collapsed: completedCollapsed,
        first: out.length === 0,
      });
      if (!completedCollapsed) {
        completed.forEach((task, i) =>
          out.push({
            kind: 'task',
            key: `c\u0000${task.id}`,
            task,
            next: completed[i + 1],
            groupKey: null,
            first: i === 0,
            last: i === completed.length - 1,
          })
        );
      }
    }
    return out;
  }, [active, groups, grouped, isGroupCollapsed, completed, completedCollapsed]);

  /**
   * Re-renders the list without changing its data.
   *
   * On a drop the library re-keys the cells it moved and counts on the new
   * order arriving in the same render to remount them in place. A drop that is
   * turned away changes no data, so nothing renders, and the lifted row stays
   * drawn wherever it was let go — over another group's header. Rendering
   * anyway remounts those cells at rest, which is the snap back.
   */
  const [, rejectDrop] = useReducer((n: number) => n + 1, 0);

  const handleReorder = ({ from, to }: ReorderableListReorderEvent) => {
    const moving = items[from];
    if (moving?.kind !== 'task' || moving.groupKey === null) {
      rejectDrop();
      return;
    }
    const groupKey = moving.groupKey;
    // The group's rows are contiguous; find where they start and end.
    let start = from;
    while (start > 0 && sameGroup(items[start - 1], groupKey)) start--;
    let end = from;
    while (end < items.length - 1 && sameGroup(items[end + 1], groupKey)) end++;
    if (to < start || to > end) {
      rejectDrop();
      return;
    }

    const ids = items.slice(start, end + 1).map((item) => (item as Extract<Item, { kind: 'task' }>).task.id);
    const [id] = ids.splice(from - start, 1);
    ids.splice(to - start, 0, id);
    const at = to - start;
    onReorder(groupKey, ids, { id, prevId: ids[at - 1] ?? null, nextId: ids[at + 1] ?? null });
  };

  const listRef = useRef<FlatList<Item> | null>(null);
  const setRefs = useCallback(
    (list: FlatList<Item> | null) => {
      listRef.current = list;
      if (typeof ref === 'function') ref(list);
      else if (ref) ref.current = list;
    },
    [ref]
  );
  /** Keys of the cells wholly on screen, as the list last reported them. */
  const onScreen = useRef<Set<string>>(new Set());
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<Item>[] }) => {
    onScreen.current = new Set(viewableItems.map((v) => v.key));
  }).current;

  useEffect(() => {
    if (!revealTaskId) return;
    const index = items.findIndex((item) => item.kind === 'task' && item.groupKey !== null && item.task.id === revealTaskId);
    if (index === -1 || onScreen.current.has(items[index].key)) return;
    // Above what's on screen comes in at the top; below, at the bottom — the
    // least scrolling that shows it, as a Mac list scrolls.
    const firstOnScreen = items.findIndex((item) => onScreen.current.has(item.key));
    listRef.current?.scrollToIndex({ index, viewPosition: index < firstOnScreen ? 0 : 1, animated: false });
  }, [revealTaskId, items]);

  const renderItem = ({ item }: ListRenderItemInfo<Item>) => {
    switch (item.kind) {
      case 'empty':
        return <EmptyCell text={emptyText} />;
      case 'header':
        return (
          <HeaderCell
            first={item.first}
            label={item.group.label}
            count={item.group.tasks.length}
            color={item.group.color}
            collapsed={item.collapsed}
            onToggle={() => toggleGroup(item.group.key)}
          />
        );
      case 'completedHeader':
        return (
          <HeaderCell
            first={item.first}
            label={`Completed · ${item.count}`}
            collapsed={item.collapsed}
            onToggle={toggleCompleted}
          />
        );
      case 'task':
        return (
          <TaskCell
            item={item}
            draggable={dragEnabled && item.groupKey !== null}
            renderRow={renderRow}
            renderDivider={renderDivider}
            dragCount={dragCount}
          />
        );
    }
  };

  return (
    <ReorderableList
      ref={setRefs}
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onReorder={handleReorder}
      panGesture={panGesture}
      dragEnabled={dragEnabled}
      shouldUpdateActiveItem={!!dragCount}
      itemLayoutAnimation={animateLayout ? LAYOUT : undefined}
      contentContainerStyle={contentContainerStyle}
      refreshControl={refreshControl}
      onScrollBeginDrag={onScrollBeginDrag}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={VIEWABILITY}
      // Rows far from the screen aren't built, so a jump to one can miss; it is
      // only ever one row past the edge here, so landing nearby is enough.
      onScrollToIndexFailed={({ averageItemLength, index }) =>
        listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false })
      }
      keyboardShouldPersistTaps="handled"
      // Enough to cover a fast flick on a long list without building it all.
      initialNumToRender={16}
      windowSize={7}
    />
  );
});

export default VirtualTaskList;

function sameGroup(item: Item | undefined, groupKey: string): boolean {
  return item?.kind === 'task' && item.groupKey === groupKey;
}

const keyExtractor = (item: Item) => item.key;

function EmptyCell({ text }: { text: string }) {
  const styles = useStyles();
  return <Text style={styles.empty}>{text}</Text>;
}

const HeaderCell = memo(function HeaderCell({
  first,
  label,
  count,
  color,
  collapsed,
  onToggle,
}: {
  first: boolean;
  label: string;
  count?: number;
  color?: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.header, first && styles.headerFirst]}>
      <SectionHeader label={label} count={count} color={color} collapsed={collapsed} onToggle={onToggle} />
    </View>
  );
});

function TaskCell({
  item,
  draggable,
  renderRow,
  renderDivider,
  dragCount,
}: {
  item: Extract<Item, { kind: 'task' }>;
  draggable: boolean;
  renderRow: Props['renderRow'];
  renderDivider: Props['renderDivider'];
  dragCount?: (id: string) => number;
}) {
  const styles = useStyles();
  const drag = useReorderableDrag();
  const completed = item.groupKey === null;
  // With a pointer the row is picked up by a grip that appears on hover, as it
  // was before; a touchscreen holds the row itself.
  const handle = draggable && FINE_POINTER;
  const [hovered, setHovered] = useState(false);
  const startDrag = useCallback(() => drag(), [drag]);

  return (
    <View
      style={[styles.cell, item.first && styles.cellFirst, item.last && styles.cellLast]}
      onPointerEnter={handle ? () => setHovered(true) : undefined}
      onPointerLeave={handle ? () => setHovered(false) : undefined}
    >
      {renderRow(item.task, { groupKey: item.groupKey, drag: draggable && !FINE_POINTER ? startDrag : undefined })}
      {!item.last && item.next && renderDivider(item.task, item.next, completed)}
      {handle && hovered && (
        <View style={styles.handleSlot}>
          <Pressable onPressIn={startDrag} style={styles.handle} accessibilityLabel="Drag to reorder">
            <IconGrip />
          </Pressable>
        </View>
      )}
      {dragCount && <DragCountBadge id={item.task.id} dragCount={dragCount} />}
    </View>
  );
}

/** Split out so only the lifted row, not every row, reads the active state. */
function DragCountBadge({ id, dragCount }: { id: string; dragCount: (id: string) => number }) {
  const styles = useStyles();
  const activeRow = useIsActive();
  const count = activeRow ? dragCount(id) : 1;
  if (count <= 1) return null;
  return (
    <View pointerEvents="none" style={styles.count}>
      <Text style={styles.countText}>{count}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textTertiary,
  },
  /** The gap between groups, then the gap between a header and its card. */
  header: {
    marginHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 2,
  },
  headerFirst: {
    paddingTop: 0,
  },
  /**
   * One slice of a card. A group's rows used to share a single bordered, rounded
   * view; each row now draws its own part of that outline, and the first and
   * last close it off.
   */
  cell: {
    position: 'relative',
    marginHorizontal: 12,
    backgroundColor: c.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  cellFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  cellLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  handleSlot: {
    position: 'absolute',
    right: 2,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  handle: {
    paddingHorizontal: 5,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: c.surface,
  },
  count: {
    position: 'absolute',
    right: 34,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  countText: {
    overflow: 'hidden',
    minWidth: 20,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: c.inverseSurface,
    color: c.inverseText,
    fontFamily: fonts.sansSemiBold,
    fontSize: 11.5,
  },
}));

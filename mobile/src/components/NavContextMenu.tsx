import React from 'react';
import { Pressable } from 'react-native';
import Popover, { PopoverAnchor } from './Popover';
import { ChipRow, MenuDivider, MenuRow, SectionLabel } from './menu/MenuItems';
import { LIST_COLORS } from '../theme/colors';
import { makeStyles } from '../theme/styles';
import { useTasks } from '../data/TaskContext';
import { confirmDestructive } from '../data/confirm';
import { IconCheckBig, IconNote, IconPlus, IconTrash } from '../icons/Icons';

/**
 * Whichever kind of nav row was held, by id rather than by value.
 *
 * The row is looked up from state on every render, so a swatch tapped in the
 * menu is reflected by the menu itself. Holding the record would freeze it as
 * it was when the menu opened, and the tick would sit on the old colour.
 */
export type NavMenuTarget = { kind: 'list' | 'folder'; id: string };

interface Props {
  target: NavMenuTarget | null;
  /** Where the press landed, in window coordinates. */
  at: PopoverAnchor | null;
  onClose: () => void;
  /** Hand off to the sheet that owns renaming. */
  onRename: () => void;
  /** Folders only: add a list to this one. */
  onNewList?: () => void;
  /** See Popover's prop: the nav lives inside a Modal, so its menu can't be one. */
  inline?: boolean;
  bounds?: { width: number; height: number };
}

/**
 * The menu a long press on a list or folder opens.
 *
 * One component for both kinds rather than two files: they share the shell, the
 * anchor plumbing and — the part that matters — the pressure to grow, since
 * per-list view settings are meant to land here later. Two files would drift
 * within a month.
 *
 * Shaped like TaskContextMenu: the thing changed most often leads as inline
 * chips that apply immediately, anything needing a choice of its own hands off
 * to the sheet that already owns it, and the destructive item sits alone at the
 * bottom behind its own divider.
 *
 * Rendered as a Popover on every platform, not through BottomSheet. A compact
 * panel at the point you pressed is the right shape on a phone too — it is what
 * this gesture means everywhere else — and a bottom sheet cannot serve the nav
 * at all: the drawer is a Modal, and a sheet portals to a provider outside it,
 * so it would be drawn behind the drawer. The nav passes `inline` for the
 * related reason that a Modal cannot nest inside one either.
 */
export default function NavContextMenu({ target, at, onClose, onRename, onNewList, inline, bounds }: Props) {
  const styles = useStyles();
  const { state, setListColor, deleteList, deleteFolder } = useTasks();
  if (!target) return null;

  const folder =
    target.kind === 'folder' ? state.folders.find((f) => f.id === target.id && !f.deletedAt) : undefined;
  const list =
    target.kind === 'list' ? state.lists.find((l) => l.id === target.id && !l.deletedAt) : undefined;
  // Deleted from under the menu — by another device, or by this one.
  if (!folder && !list) return null;


  // Every choice closes the menu: these are one-shot edits, and leaving the
  // panel up over a row that has just moved would be disorienting.
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  if (folder) {
    const lists = state.lists.filter((l) => l.folderId === folder.id && !l.deletedAt);
    const confirmDelete = () => {
      const fate = lists.length
        ? `Its ${lists.length} list${lists.length === 1 ? '' : 's'} go too; their tasks move to Inbox, not deleted.`
        : 'It has no lists.';
      confirmDestructive(`Delete "${folder.name}"?`, fate, () => {
        deleteFolder(folder.id);
        onClose();
      });
    };
    return (
      <Popover visible={!!at} onClose={onClose} anchor={at} align="start" width={252} inline={inline} bounds={bounds}>
        <MenuRow icon={<IconNote size={16} />} label="Rename…" onPress={run(onRename)} />
        {onNewList && (
          <MenuRow icon={<IconPlus size={16} />} label="New list here" onPress={run(onNewList)} />
        )}
        <MenuDivider />
        <MenuRow icon={<IconTrash size={16} />} label="Delete folder" destructive onPress={confirmDelete} />
      </Popover>
    );
  }

  if (!list) return null;
  const taskCount = state.tasks.filter((t) => t.listId === list.id && !t.deletedAt).length;
  const confirmDelete = () => {
    // Say what happens to the tasks — "delete list" is otherwise ambiguous about
    // whether it takes them with it.
    const fate =
      taskCount === 0
        ? 'It has no tasks.'
        : `Its ${taskCount} task${taskCount === 1 ? '' : 's'} will move to Inbox, not be deleted.`;
    confirmDestructive(`Delete "${list.name}"?`, fate, () => {
      deleteList(list.id);
      onClose();
    });
  };

  return (
    <Popover visible={!!at} onClose={onClose} anchor={at} align="start" width={252} inline={inline} bounds={bounds}>
      <SectionLabel>Colour</SectionLabel>
      <ChipRow>
        {LIST_COLORS.map((color) => {
          const active = list.color === color;
          return (
            <Pressable
              key={color}
              onPress={() => setListColor(list.id, color)}
              style={[styles.swatch, { backgroundColor: color }, active && styles.swatchActive]}
              accessibilityLabel={`Set colour ${color}`}
            >
              {active && <IconCheckBig size={13} color="#fff" strokeWidth={2.6} />}
            </Pressable>
          );
        })}
      </ChipRow>

      {/* No "move to folder" item: dragging the row does that, in both
          directions and to the root as well, which a picker could not express
          as cleanly. */}
      <MenuRow icon={<IconNote size={16} />} label="Rename…" onPress={run(onRename)} />
      <MenuDivider />
      <MenuRow icon={<IconTrash size={16} />} label="Delete list" destructive onPress={confirmDelete} />
    </Popover>
  );
}

/**
 * Swatches rather than chips: a colour needs no label, and at 26pt eight of them
 * fit two rows inside the drawer's width without the panel having to scroll.
 */
const useStyles = makeStyles((c) => ({
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: c.textPrimary,
  },
}));

import React from 'react';
import { useSidebar } from '../../navigation/SidebarContext';
import { useTasks } from '../../data/TaskContext';
import ListOptionsSheet from '../pickers/ListOptionsSheet';
import FolderOptionsSheet from '../pickers/FolderOptionsSheet';
import NewListSheet from '../pickers/NewListSheet';
import NewFolderSheet from '../pickers/NewFolderSheet';

/**
 * The sheets the nav opens, mounted beside it rather than inside it.
 *
 * They cannot live in the sidebar. The drawer is a Modal, and these are
 * presented by a provider mounted above the navigator — outside it — so a sheet
 * opened from the drawer is drawn behind the drawer: nothing visibly happens,
 * except that its text field takes focus and raises the keyboard over nothing.
 * Closing the drawer first only trades that for a worse bug, since it unmounts
 * the sidebar and the sheet with it.
 *
 * Owned at the Layout level, the drawer can close and the sheet still open —
 * the same arrangement, and the same reason, as the server sheet next to it.
 *
 * Targets arrive as ids and are resolved here, so a sheet left open while its
 * list is renamed or deleted elsewhere follows rather than showing a stale copy.
 */
export default function NavSheets() {
  const { navSheet, closeNavSheet } = useSidebar();
  const { state } = useTasks();

  const list =
    navSheet?.kind === 'renameList'
      ? state.lists.find((l) => l.id === navSheet.id && !l.deletedAt) ?? null
      : null;
  const folder =
    navSheet?.kind === 'renameFolder'
      ? state.folders.find((f) => f.id === navSheet.id && !f.deletedAt) ?? null
      : null;
  const newListFolder =
    navSheet?.kind === 'newList' && navSheet.folderId
      ? state.folders.find((f) => f.id === navSheet.folderId && !f.deletedAt) ?? null
      : null;

  return (
    <>
      <ListOptionsSheet list={list} onClose={closeNavSheet} />
      <FolderOptionsSheet folder={folder} onClose={closeNavSheet} />
      <NewListSheet
        visible={navSheet?.kind === 'newList'}
        folder={newListFolder}
        onClose={closeNavSheet}
      />
      <NewFolderSheet visible={navSheet?.kind === 'newFolder'} onClose={closeNavSheet} />
    </>
  );
}

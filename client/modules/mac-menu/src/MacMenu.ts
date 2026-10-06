import { requireOptionalNativeModule } from 'expo';
import type { NativeModule } from 'expo';

/**
 * A command as the menu bar is built from it: `CommandDef` from
 * src/navigation/commands.ts, flattened to what MacMenuBar.swift reads.
 */
export interface MacMenuCommandSpec {
  id: string;
  title: string;
  menu: string;
  group: string;
  submenu?: string;
  input?: string;
  modifiers: string[];
  list: boolean;
}

type MacMenuEvents = {
  /** A command's id, or 'undo' for Edit ▸ Undo of a completion. */
  onCommand: (event: { command: string }) => void;
};

declare class MacMenuModule extends NativeModule<MacMenuEvents> {
  /** Offers Edit ▸ Undo under this name, or withdraws it (null). */
  setUndo(actionName: string | null): Promise<void>;
  /** Rebuilds the app's menus from this list. */
  setCommands(commands: MacMenuCommandSpec[]): Promise<void>;
  /** The commands something can answer right now; every other one is dimmed. */
  setEnabled(ids: string[]): Promise<void>;
}

/**
 * iOS builds only; null on web and Android. On a phone it loads but has no menu
 * bar to add to, so callers gate on `MAC` rather than on this being non-null.
 * See MacMenuBar.swift.
 */
export default requireOptionalNativeModule<MacMenuModule>('MacMenu');
